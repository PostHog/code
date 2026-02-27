import fs from "node:fs/promises";
import path from "node:path";
import { Saga } from "@posthog/shared";
import type { ArchivedTask } from "@shared/types/archive";
import { createGitClient } from "@twig/git/client";
import {
  CaptureCheckpointSaga,
  deleteCheckpoint,
  RevertCheckpointSaga,
} from "@twig/git/sagas/checkpoint";
import { type WorktreeInfo, WorktreeManager } from "@twig/git/worktree";
import { archiveStore, foldersStore } from "../../utils/store";
import {
  deriveWorktreePath,
  getFolderPath,
  getTaskAssociations,
} from "../../utils/worktree-helpers";
import type { AgentService } from "../agent/service";
import type { FileWatcherService } from "../file-watcher/service";
import type { ProcessTrackingService } from "../process-tracking/service";
import { getWorktreeLocation } from "../settingsStore";
import type { ArchiveTaskInput } from "./schemas";

interface ArchiveTaskSagaInput {
  input: ArchiveTaskInput;
  agentService: AgentService;
  processTracking: ProcessTrackingService;
  fileWatcher: FileWatcherService;
}

export class ArchiveTaskSaga extends Saga<ArchiveTaskSagaInput, ArchivedTask> {
  protected async execute(
    sagaInput: ArchiveTaskSagaInput,
  ): Promise<ArchivedTask> {
    const { input, agentService, processTracking, fileWatcher } = sagaInput;
    const { taskId } = input;

    const association = getTaskAssociations().find((a) => a.taskId === taskId);
    if (!association) {
      throw new Error(`No workspace association found for task ${taskId}`);
    }

    const folderPath = getFolderPath(association.folderId);
    if (!folderPath) {
      throw new Error(`Folder not found for task ${taskId}`);
    }

    const archivedTask: ArchivedTask = {
      taskId: input.taskId,
      title: input.title,
      archivedAt: new Date().toISOString(),
      repository: input.repository,
      folderId: association.folderId,
      mode: association.mode,
      worktreeName:
        association.mode === "worktree" ? association.worktree : null,
      branchName: null,
      checkpointId:
        association.mode === "worktree"
          ? `worktree-${association.worktree}`
          : null,
    };

    if (association.mode === "worktree") {
      const worktreePath = deriveWorktreePath(folderPath, association.worktree);

      const actualBranch = await this.getCurrentBranchName(worktreePath);
      if (actualBranch && actualBranch !== "HEAD") {
        archivedTask.branchName = actualBranch;
      }

      await this.step({
        name: "capture_checkpoint",
        execute: async () => {
          if (!archivedTask.checkpointId) {
            throw new Error("checkpointId must be set for worktree mode");
          }
          await this.captureWorktreeCheckpoint(
            folderPath,
            worktreePath,
            archivedTask.checkpointId,
          );
        },
        rollback: async () => {
          if (archivedTask.checkpointId) {
            const git = createGitClient(folderPath);
            await deleteCheckpoint(git, archivedTask.checkpointId);
          }
        },
      });

      await this.step({
        name: "cleanup_resources",
        execute: async () => {
          await agentService.cancelSessionsByTaskId(taskId);
          processTracking.killByTaskId(taskId);
          await fileWatcher.stopWatching(worktreePath);
        },
        rollback: async () => {},
      });

      await this.step({
        name: "delete_worktree",
        execute: async () => {
          const manager = new WorktreeManager({
            mainRepoPath: folderPath,
            worktreeBasePath: getWorktreeLocation(),
          });
          await manager.deleteWorktree(worktreePath);
          const parentDir = path.dirname(worktreePath);
          await fs.rm(parentDir, { recursive: true, force: true });
        },
        rollback: async () => {},
      });
    } else {
      await this.step({
        name: "cleanup_resources",
        execute: async () => {
          await agentService.cancelSessionsByTaskId(taskId);
          processTracking.killByTaskId(taskId);
        },
        rollback: async () => {},
      });
    }

    await this.step({
      name: "remove_association",
      execute: async () => {
        const associations = getTaskAssociations();
        const updatedAssociations = associations.filter(
          (a) => a.taskId !== taskId,
        );
        foldersStore.set("taskAssociations", updatedAssociations);
      },
      rollback: async () => {
        const associations = getTaskAssociations();
        associations.push(association);
        foldersStore.set("taskAssociations", associations);
      },
    });

    await this.step({
      name: "save_archived_task",
      execute: async () => {
        const archivedTasks = archiveStore.get("archivedTasks", []);
        const existingIndex = archivedTasks.findIndex(
          (t) => t.taskId === taskId,
        );
        if (existingIndex >= 0) {
          archivedTasks[existingIndex] = archivedTask;
        } else {
          archivedTasks.push(archivedTask);
        }
        archiveStore.set("archivedTasks", archivedTasks);
      },
      rollback: async () => {
        const archivedTasks = archiveStore.get("archivedTasks", []);
        const updatedArchivedTasks = archivedTasks.filter(
          (t) => t.taskId !== taskId,
        );
        archiveStore.set("archivedTasks", updatedArchivedTasks);
      },
    });

    return archivedTask;
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
}

interface UnarchiveTaskSagaInput {
  taskId: string;
  fileWatcher: FileWatcherService;
  recreateBranch?: boolean;
}

export class UnarchiveTaskSaga extends Saga<
  UnarchiveTaskSagaInput,
  { taskId: string; worktreeName: string | null }
> {
  protected async execute(
    sagaInput: UnarchiveTaskSagaInput,
  ): Promise<{ taskId: string; worktreeName: string | null }> {
    const { taskId, recreateBranch } = sagaInput;

    const archived = archiveStore
      .get("archivedTasks", [])
      .find((t) => t.taskId === taskId);
    if (!archived) {
      throw new Error(`Archived task not found: ${taskId}`);
    }

    const folderPath = getFolderPath(archived.folderId);
    if (!folderPath) {
      throw new Error(`Folder not found for task ${taskId}`);
    }

    let restoredWorktreeName: string | null = null;
    const shouldRestoreWorktree =
      archived.mode === "worktree" && archived.checkpointId;

    if (shouldRestoreWorktree) {
      await this.step({
        name: "restore_worktree",
        execute: async () => {
          restoredWorktreeName = await this.restoreWorktreeFromCheckpoint(
            folderPath,
            archived,
            recreateBranch,
          );
        },
        rollback: async () => {
          if (restoredWorktreeName) {
            const manager = new WorktreeManager({
              mainRepoPath: folderPath,
              worktreeBasePath: getWorktreeLocation(),
            });
            const worktreePath = deriveWorktreePath(
              folderPath,
              restoredWorktreeName,
            );
            await manager.deleteWorktree(worktreePath);
            const parentDir = path.dirname(worktreePath);
            await fs.rm(parentDir, { recursive: true, force: true });
          }
        },
      });

      await this.step({
        name: "restore_association",
        execute: async () => {
          if (!restoredWorktreeName) {
            throw new Error("Failed to restore worktree");
          }
          const associations = getTaskAssociations();
          associations.push({
            taskId,
            folderId: archived.folderId,
            mode: "worktree" as const,
            worktree: restoredWorktreeName,
            branchName: archived.branchName ?? null,
          });
          foldersStore.set("taskAssociations", associations);
        },
        rollback: async () => {
          const associations = getTaskAssociations();
          const updatedAssociations = associations.filter(
            (a) => a.taskId !== taskId,
          );
          foldersStore.set("taskAssociations", updatedAssociations);
        },
      });
    } else {
      await this.step({
        name: "restore_association",
        execute: async () => {
          const associations = getTaskAssociations();
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
          foldersStore.set("taskAssociations", associations);
        },
        rollback: async () => {
          const associations = getTaskAssociations();
          const updatedAssociations = associations.filter(
            (a) => a.taskId !== taskId,
          );
          foldersStore.set("taskAssociations", updatedAssociations);
        },
      });
    }

    await this.step({
      name: "remove_archived_task",
      execute: async () => {
        const archivedTasks = archiveStore.get("archivedTasks", []);
        const updatedArchivedTasks = archivedTasks.filter(
          (t) => t.taskId !== taskId,
        );
        archiveStore.set("archivedTasks", updatedArchivedTasks);
      },
      rollback: async () => {
        const archivedTasks = archiveStore.get("archivedTasks", []);
        archivedTasks.push(archived);
        archiveStore.set("archivedTasks", archivedTasks);
      },
    });

    return { taskId, worktreeName: restoredWorktreeName };
  }

  private async restoreWorktreeFromCheckpoint(
    folderPath: string,
    archived: ArchivedTask,
    recreateBranch?: boolean,
  ): Promise<string> {
    const manager = new WorktreeManager({
      mainRepoPath: folderPath,
      worktreeBasePath: getWorktreeLocation(),
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
