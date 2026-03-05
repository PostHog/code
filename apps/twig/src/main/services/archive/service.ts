import fs from "node:fs/promises";
import path from "node:path";
import type { TaskFolderAssociation } from "@shared/types";
import type { ArchivedTask } from "@shared/types/archive";
import { createGitClient } from "@twig/git/client";
import {
  CaptureCheckpointSaga,
  deleteCheckpoint,
  RevertCheckpointSaga,
} from "@twig/git/sagas/checkpoint";
import { type WorktreeInfo, WorktreeManager } from "@twig/git/worktree";
import type Store from "electron-store";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../utils/logger";
import type { AgentService } from "../agent/service.js";
import type { FileWatcherService } from "../file-watcher/service.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import type { ArchiveTaskInput } from "./schemas.js";

const log = logger.scope("archive");

interface FoldersSchema {
  folders: Array<{ id: string; path: string; name: string }>;
  taskAssociations: TaskFolderAssociation[];
}

interface ArchiveStoreSchema {
  archivedTasks: ArchivedTask[];
}

interface SettingsSchema {
  worktreeLocation: string;
}

type RollbackFn = () => Promise<void>;

@injectable()
export class ArchiveService {
  constructor(
    @inject(MAIN_TOKENS.AgentService)
    private readonly agentService: AgentService,
    @inject(MAIN_TOKENS.ProcessTrackingService)
    private readonly processTracking: ProcessTrackingService,
    @inject(MAIN_TOKENS.FileWatcherService)
    private readonly fileWatcher: FileWatcherService,
    @inject(MAIN_TOKENS.ArchiveStore)
    private readonly archiveStore: Store<ArchiveStoreSchema>,
    @inject(MAIN_TOKENS.FoldersStore)
    private readonly foldersStore: Store<FoldersSchema>,
    @inject(MAIN_TOKENS.SettingsStore)
    private readonly settingsStore: Store<SettingsSchema>,
  ) {}

  async archiveTask(input: ArchiveTaskInput): Promise<ArchivedTask> {
    log.info(`Archiving task ${input.taskId}`);

    const rollbacks: RollbackFn[] = [];
    const runWithRollback = async (
      execute: () => Promise<void>,
      rollback: RollbackFn,
    ) => {
      await execute();
      rollbacks.push(rollback);
    };

    try {
      const result = await this.executeArchive(input, runWithRollback);
      log.info(`Task ${input.taskId} archived successfully`);
      return result;
    } catch (error) {
      for (const rollback of rollbacks.reverse()) {
        try {
          await rollback();
        } catch (rollbackError) {
          log.error("Rollback failed:", rollbackError);
        }
      }
      throw error;
    }
  }

  private async executeArchive(
    input: ArchiveTaskInput,
    step: (execute: () => Promise<void>, rollback: RollbackFn) => Promise<void>,
  ): Promise<ArchivedTask> {
    const { taskId } = input;

    const association = this.getTaskAssociations().find(
      (a) => a.taskId === taskId,
    );

    const archivedTask: ArchivedTask = association
      ? {
          taskId,
          archivedAt: new Date().toISOString(),
          folderId: association.folderId,
          mode: association.mode,
          worktreeName:
            association.mode === "worktree" ? association.worktree : null,
          branchName: null,
          checkpointId:
            association.mode === "worktree"
              ? `worktree-${association.worktree}`
              : null,
        }
      : {
          taskId,
          archivedAt: new Date().toISOString(),
          folderId: "",
          mode: "cloud",
          worktreeName: null,
          branchName: null,
          checkpointId: null,
        };

    if (association) {
      const folderPath = this.getFolderPath(association.folderId);
      if (!folderPath) {
        throw new Error(`Folder not found for task ${taskId}`);
      }

      if (association.mode === "worktree") {
        const worktreePath = await this.deriveWorktreePath(
          folderPath,
          association.worktree,
        );

        const actualBranch = await this.getCurrentBranchName(worktreePath);
        if (actualBranch && actualBranch !== "HEAD") {
          archivedTask.branchName = actualBranch;
        }

        await step(
          async () => {
            if (!archivedTask.checkpointId) {
              throw new Error("checkpointId must be set for worktree mode");
            }
            await this.captureWorktreeCheckpoint(
              folderPath,
              worktreePath,
              archivedTask.checkpointId,
            );
          },
          async () => {
            if (archivedTask.checkpointId) {
              const git = createGitClient(folderPath);
              await deleteCheckpoint(git, archivedTask.checkpointId);
            }
          },
        );

        await step(
          async () => {
            await this.agentService.cancelSessionsByTaskId(taskId);
            this.processTracking.killByTaskId(taskId);
            await this.fileWatcher.stopWatching(worktreePath);
          },
          async () => {},
        );

        await step(
          async () => {
            const manager = new WorktreeManager({
              mainRepoPath: folderPath,
              worktreeBasePath: this.getWorktreeLocation(),
            });
            await manager.deleteWorktree(worktreePath);
            const parentDir = path.dirname(worktreePath);
            await fs.rm(parentDir, { recursive: true, force: true });
          },
          async () => {},
        );
      }
    }

    if (association?.mode !== "worktree") {
      await step(
        async () => {
          await this.agentService.cancelSessionsByTaskId(taskId);
          this.processTracking.killByTaskId(taskId);
        },
        async () => {},
      );
    }

    if (association) {
      await step(
        async () => {
          const associations = this.getTaskAssociations();
          this.foldersStore.set(
            "taskAssociations",
            associations.filter((a) => a.taskId !== taskId),
          );
        },
        async () => {
          const associations = this.getTaskAssociations();
          associations.push(association);
          this.foldersStore.set("taskAssociations", associations);
        },
      );
    }

    await step(
      async () => {
        const archivedTasks = this.archiveStore.get("archivedTasks", []);
        const existingIndex = archivedTasks.findIndex(
          (t) => t.taskId === taskId,
        );
        if (existingIndex >= 0) {
          archivedTasks[existingIndex] = archivedTask;
        } else {
          archivedTasks.push(archivedTask);
        }
        this.archiveStore.set("archivedTasks", archivedTasks);
      },
      async () => {
        const archivedTasks = this.archiveStore.get("archivedTasks", []);
        const updatedArchivedTasks = archivedTasks.filter(
          (t) => t.taskId !== taskId,
        );
        this.archiveStore.set("archivedTasks", updatedArchivedTasks);
      },
    );

    return archivedTask;
  }

  async unarchiveTask(
    taskId: string,
    recreateBranch?: boolean,
  ): Promise<{ taskId: string; worktreeName: string | null }> {
    log.info(
      `Unarchiving task ${taskId}${recreateBranch ? " (recreate branch)" : ""}`,
    );

    const rollbacks: RollbackFn[] = [];
    const runWithRollback = async (
      execute: () => Promise<void>,
      rollback: RollbackFn,
    ) => {
      await execute();
      rollbacks.push(rollback);
    };

    try {
      const result = await this.executeUnarchive(
        taskId,
        recreateBranch,
        runWithRollback,
      );
      log.info(`Task ${taskId} unarchived successfully`);
      return result;
    } catch (error) {
      for (const rollback of rollbacks.reverse()) {
        try {
          await rollback();
        } catch (rollbackError) {
          log.error("Rollback failed:", rollbackError);
        }
      }
      throw error;
    }
  }

  private async executeUnarchive(
    taskId: string,
    recreateBranch: boolean | undefined,
    step: (execute: () => Promise<void>, rollback: RollbackFn) => Promise<void>,
  ): Promise<{ taskId: string; worktreeName: string | null }> {
    const archived = this.archiveStore
      .get("archivedTasks", [])
      .find((t) => t.taskId === taskId);
    if (!archived) {
      throw new Error(`Archived task not found: ${taskId}`);
    }

    let restoredWorktreeName: string | null = null;

    if (archived.folderId) {
      const folderPath = this.getFolderPath(archived.folderId);
      if (!folderPath) {
        throw new Error(`Folder not found for task ${taskId}`);
      }
      const shouldRestoreWorktree =
        archived.mode === "worktree" && archived.checkpointId;

      if (shouldRestoreWorktree) {
        await step(
          async () => {
            restoredWorktreeName = await this.restoreWorktreeFromCheckpoint(
              folderPath,
              archived,
              recreateBranch,
            );
          },
          async () => {
            if (restoredWorktreeName) {
              const manager = new WorktreeManager({
                mainRepoPath: folderPath,
                worktreeBasePath: this.getWorktreeLocation(),
              });
              const worktreePath = await this.deriveWorktreePath(
                folderPath,
                restoredWorktreeName,
              );
              await manager.deleteWorktree(worktreePath);
              const parentDir = path.dirname(worktreePath);
              await fs.rm(parentDir, { recursive: true, force: true });
            }
          },
        );

        await step(
          async () => {
            if (!restoredWorktreeName) {
              throw new Error("Failed to restore worktree");
            }
            const associations = this.getTaskAssociations();
            associations.push({
              taskId,
              folderId: archived.folderId,
              mode: "worktree" as const,
              worktree: restoredWorktreeName,
              branchName: archived.branchName ?? null,
            });
            this.foldersStore.set("taskAssociations", associations);
          },
          async () => {
            const associations = this.getTaskAssociations();
            const updatedAssociations = associations.filter(
              (a) => a.taskId !== taskId,
            );
            this.foldersStore.set("taskAssociations", updatedAssociations);
          },
        );
      } else {
        await step(
          async () => {
            const associations = this.getTaskAssociations();
            if (archived.mode === "cloud") {
              associations.push({
                taskId,
                folderId: archived.folderId,
                mode: "cloud" as const,
              });
            } else {
              associations.push({
                taskId,
                folderId: archived.folderId,
                mode: "local" as const,
              });
            }
            this.foldersStore.set("taskAssociations", associations);
          },
          async () => {
            const associations = this.getTaskAssociations();
            const updatedAssociations = associations.filter(
              (a) => a.taskId !== taskId,
            );
            this.foldersStore.set("taskAssociations", updatedAssociations);
          },
        );
      }
    }

    await step(
      async () => {
        const archivedTasks = this.archiveStore.get("archivedTasks", []);
        const updatedArchivedTasks = archivedTasks.filter(
          (t) => t.taskId !== taskId,
        );
        this.archiveStore.set("archivedTasks", updatedArchivedTasks);
      },
      async () => {
        const archivedTasks = this.archiveStore.get("archivedTasks", []);
        archivedTasks.push(archived);
        this.archiveStore.set("archivedTasks", archivedTasks);
      },
    );

    return { taskId, worktreeName: restoredWorktreeName };
  }

  getArchivedTasks(): ArchivedTask[] {
    return this.archiveStore.get("archivedTasks", []);
  }

  getArchivedTaskIds(): string[] {
    return this.archiveStore.get("archivedTasks", []).map((t) => t.taskId);
  }

  isArchived(taskId: string): boolean {
    return this.archiveStore
      .get("archivedTasks", [])
      .some((t) => t.taskId === taskId);
  }

  async deleteArchivedTask(taskId: string): Promise<void> {
    log.info(`Deleting archived task ${taskId}`);

    const archivedTasks = this.archiveStore.get("archivedTasks", []);
    const archived = archivedTasks.find((t) => t.taskId === taskId);

    if (!archived) {
      throw new Error(`Archived task ${taskId} not found`);
    }

    if (archived.checkpointId && archived.folderId) {
      const folderPath = this.getFolderPath(archived.folderId);
      if (folderPath) {
        try {
          const git = createGitClient(folderPath);
          await deleteCheckpoint(git, archived.checkpointId);
        } catch (error) {
          log.warn(`Failed to delete checkpoint ${archived.checkpointId}`, {
            error,
          });
        }
      }
    }

    const updatedArchivedTasks = archivedTasks.filter(
      (t) => t.taskId !== taskId,
    );
    this.archiveStore.set("archivedTasks", updatedArchivedTasks);

    log.info(`Deleted archived task ${taskId}`);
  }

  private getTaskAssociations(): TaskFolderAssociation[] {
    return this.foldersStore.get("taskAssociations", []);
  }

  private getFolderPath(folderId: string): string | null {
    const folders = this.foldersStore.get("folders", []);
    const folder = folders.find((f) => f.id === folderId);
    return folder?.path ?? null;
  }

  private getWorktreeLocation(): string {
    return this.settingsStore.get("worktreeLocation");
  }

  private async deriveWorktreePath(
    folderPath: string,
    worktreeName: string,
  ): Promise<string> {
    const worktreeBasePath = this.getWorktreeLocation();
    const repoName = path.basename(folderPath);

    const newFormatPath = path.join(worktreeBasePath, worktreeName, repoName);
    const legacyFormatPath = path.join(
      worktreeBasePath,
      repoName,
      worktreeName,
    );

    try {
      await fs.access(newFormatPath);
      return newFormatPath;
    } catch {}

    try {
      await fs.access(legacyFormatPath);
      return legacyFormatPath;
    } catch {}

    return newFormatPath;
  }

  private async getCurrentBranchName(worktreePath: string): Promise<string> {
    const git = createGitClient(worktreePath);
    try {
      const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
      return branch.trim();
    } catch {
      return "";
    }
  }

  private async captureWorktreeCheckpoint(
    folderPath: string,
    worktreePath: string,
    checkpointId: string,
  ): Promise<void> {
    const git = createGitClient(folderPath);
    try {
      await deleteCheckpoint(git, checkpointId);
    } catch {}

    const saga = new CaptureCheckpointSaga();
    const result = await saga.run({ baseDir: worktreePath, checkpointId });
    if (!result.success) {
      throw new Error(`Failed to capture checkpoint: ${result.error}`);
    }
  }

  private async restoreWorktreeFromCheckpoint(
    folderPath: string,
    archived: ArchivedTask,
    recreateBranch?: boolean,
  ): Promise<string> {
    const manager = new WorktreeManager({
      mainRepoPath: folderPath,
      worktreeBasePath: this.getWorktreeLocation(),
    });
    const preferredName = archived.worktreeName ?? undefined;

    let worktree: WorktreeInfo;
    if (archived.branchName && !recreateBranch) {
      worktree = await manager.createWorktreeForExistingBranch(
        archived.branchName,
        preferredName,
      );
    } else {
      worktree = await manager.createDetachedWorktreeAtCommit(
        "HEAD",
        preferredName,
      );
    }

    if (!archived.checkpointId) {
      throw new Error("checkpointId is required for restoring worktree");
    }

    const revertSaga = new RevertCheckpointSaga();
    const result = await revertSaga.run({
      baseDir: worktree.worktreePath,
      checkpointId: archived.checkpointId,
    });

    if (!result.success) {
      throw new Error(
        `Worktree restored but failed to apply checkpoint: ${result.error}`,
      );
    }

    if (recreateBranch && archived.branchName) {
      const git = createGitClient(worktree.worktreePath);
      await git.checkoutLocalBranch(archived.branchName);
    }

    return worktree.worktreeName;
  }
}
