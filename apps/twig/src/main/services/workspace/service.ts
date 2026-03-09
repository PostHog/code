import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import path from "node:path";
import { createGitClient } from "@twig/git/client";
import {
  getCurrentBranch,
  getDefaultBranch,
  hasTrackedFiles,
} from "@twig/git/queries";
import { CreateOrSwitchBranchSaga } from "@twig/git/sagas/branch";
import { DetachHeadSaga } from "@twig/git/sagas/head";
import { WorktreeManager } from "@twig/git/worktree";
import { inject, injectable } from "inversify";
import type { RepositoryRepository } from "../../db/repositories/repository-repository.js";
import type { WorkspaceRepository } from "../../db/repositories/workspace-repository.js";
import type { WorktreeRepository } from "../../db/repositories/worktree-repository.js";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter.js";
import { deriveWorktreePath } from "../../utils/worktree-helpers";
import type { AgentService } from "../agent/service.js";
import { FileWatcherEvent } from "../file-watcher/schemas.js";
import type { FileWatcherService } from "../file-watcher/service.js";
import type { FocusService } from "../focus/service.js";
import { FocusServiceEvent } from "../focus/service.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import { getWorktreeLocation } from "../settingsStore";
import type { ShellService } from "../shell/service.js";
import { loadConfig, normalizeScripts } from "./configLoader";
import type {
  BranchChangedPayload,
  CreateWorkspaceInput,
  ScriptExecutionResult,
  Workspace,
  WorkspaceErrorPayload,
  WorkspaceInfo,
  WorkspacePromotedPayload,
  WorkspaceTerminalCreatedPayload,
  WorkspaceTerminalInfo,
  WorkspaceWarningPayload,
  WorktreeInfo,
} from "./schemas.js";
import { ScriptRunner } from "./scriptRunner";
import { buildWorkspaceEnv } from "./workspaceEnv";

type TaskAssociation =
  | { taskId: string; folderId: string; mode: "local" }
  | { taskId: string; folderId: string | null; mode: "cloud" }
  | {
      taskId: string;
      folderId: string;
      mode: "worktree";
      worktree: string;
      branchName: string | null;
    };

async function hasAnyFiles(repoPath: string): Promise<boolean> {
  try {
    const entries = await fsPromises.readdir(repoPath);
    return entries.some((entry) => entry !== ".git");
  } catch {
    return false;
  }
}

/**
 * Get the current branch name for a repo or worktree by reading its Git HEAD file.
 * Returns null if in detached HEAD state or doesn't exist.
 */
async function getBranchFromPath(repoPath: string): Promise<string | null> {
  try {
    const gitPath = path.join(repoPath, ".git");
    const stat = await fsPromises.stat(gitPath);

    let headPath: string;
    if (stat.isDirectory()) {
      // Regular repo - .git is a directory
      headPath = path.join(gitPath, "HEAD");
    } else {
      // Worktree - .git is a file pointing to gitdir
      const gitContent = await fsPromises.readFile(gitPath, "utf-8");
      const gitdirMatch = gitContent.match(/gitdir:\s*(.+)/);
      if (!gitdirMatch) return null;
      headPath = path.join(gitdirMatch[1].trim(), "HEAD");
    }

    const headContent = await fsPromises.readFile(headPath, "utf-8");
    const branchMatch = headContent.match(/ref: refs\/heads\/(.+)/);
    return branchMatch ? branchMatch[1].trim() : null;
  } catch {
    return null;
  }
}

const log = logger.scope("workspace");

export const WorkspaceServiceEvent = {
  TerminalCreated: "terminalCreated",
  Error: "error",
  Warning: "warning",
  Promoted: "promoted",
  BranchChanged: "branchChanged",
} as const;

export interface WorkspaceServiceEvents {
  [WorkspaceServiceEvent.TerminalCreated]: WorkspaceTerminalCreatedPayload;
  [WorkspaceServiceEvent.Error]: WorkspaceErrorPayload;
  [WorkspaceServiceEvent.Warning]: WorkspaceWarningPayload;
  [WorkspaceServiceEvent.Promoted]: WorkspacePromotedPayload;
  [WorkspaceServiceEvent.BranchChanged]: BranchChangedPayload;
}

@injectable()
export class WorkspaceService extends TypedEventEmitter<WorkspaceServiceEvents> {
  @inject(MAIN_TOKENS.ShellService)
  private shellService!: ShellService;

  @inject(MAIN_TOKENS.AgentService)
  private agentService!: AgentService;

  @inject(MAIN_TOKENS.ProcessTrackingService)
  private processTracking!: ProcessTrackingService;

  @inject(MAIN_TOKENS.RepositoryRepository)
  private repositoryRepo!: RepositoryRepository;

  @inject(MAIN_TOKENS.WorkspaceRepository)
  private workspaceRepo!: WorkspaceRepository;

  @inject(MAIN_TOKENS.WorktreeRepository)
  private worktreeRepo!: WorktreeRepository;

  private scriptRunner!: ScriptRunner;
  private creatingWorkspaces = new Map<string, Promise<WorkspaceInfo>>();
  private branchWatcherInitialized = false;

  private ensureScriptRunner(): ScriptRunner {
    if (!this.scriptRunner) {
      this.scriptRunner = new ScriptRunner({
        shellService: this.shellService,
        onTerminalCreated: (info) => {
          this.emit(WorkspaceServiceEvent.TerminalCreated, info);
        },
      });
    }
    return this.scriptRunner;
  }

  private findTaskAssociation(taskId: string): TaskAssociation | null {
    const workspace = this.workspaceRepo.findByTaskId(taskId);
    if (!workspace) return null;

    if (workspace.mode === "cloud") {
      return {
        taskId,
        folderId: workspace.repositoryId,
        mode: "cloud",
      };
    }

    if (!workspace.repositoryId) return null;

    if (workspace.mode === "worktree") {
      const worktree = this.worktreeRepo.findByWorkspaceId(workspace.id);
      if (!worktree) return null;
      return {
        taskId,
        folderId: workspace.repositoryId,
        mode: "worktree",
        worktree: worktree.name,
        branchName: null,
      };
    }

    return {
      taskId,
      folderId: workspace.repositoryId,
      mode: "local",
    };
  }

  private getFolderPath(folderId: string): string | null {
    const repo = this.repositoryRepo.findById(folderId);
    return repo?.path ?? null;
  }

  private getAllTaskAssociations(): TaskAssociation[] {
    const workspaces = this.workspaceRepo.findAll();
    const result: TaskAssociation[] = [];

    for (const workspace of workspaces) {
      if (workspace.mode === "cloud") {
        result.push({
          taskId: workspace.taskId,
          folderId: workspace.repositoryId,
          mode: "cloud",
        });
        continue;
      }

      if (!workspace.repositoryId) continue;

      if (workspace.mode === "worktree") {
        const worktree = this.worktreeRepo.findByWorkspaceId(workspace.id);
        if (!worktree) continue;
        result.push({
          taskId: workspace.taskId,
          folderId: workspace.repositoryId,
          mode: "worktree",
          worktree: worktree.name,
          branchName: null,
        });
      } else {
        result.push({
          taskId: workspace.taskId,
          folderId: workspace.repositoryId,
          mode: "local",
        });
      }
    }

    return result;
  }

  /**
   * Initialize branch change watching. Should be called after app is ready.
   * Subscribes to GitStateChanged events and checks for branch renames.
   */
  initBranchWatcher(): void {
    if (this.branchWatcherInitialized) return;
    this.branchWatcherInitialized = true;

    const fileWatcher = container.get<FileWatcherService>(
      MAIN_TOKENS.FileWatcherService,
    );
    const focusService = container.get<FocusService>(MAIN_TOKENS.FocusService);

    fileWatcher.on(
      FileWatcherEvent.GitStateChanged,
      this.handleGitStateChanged.bind(this),
    );

    focusService.on(
      FocusServiceEvent.BranchRenamed,
      this.handleFocusBranchRenamed.bind(this),
    );

    log.info("Branch watcher initialized");
  }

  private handleFocusBranchRenamed({
    worktreePath,
    newBranch,
  }: {
    mainRepoPath: string;
    worktreePath: string;
    oldBranch: string;
    newBranch: string;
  }): void {
    const associations = this.getAllTaskAssociations();
    for (const assoc of associations) {
      if (assoc.mode !== "worktree") continue;
      const folderPath = this.getFolderPath(assoc.folderId);
      if (!folderPath) continue;
      const derivedPath = deriveWorktreePath(folderPath, assoc.worktree);
      if (derivedPath === worktreePath && assoc.branchName !== newBranch) {
        this.updateAssociationBranchName(assoc.taskId, newBranch);
        this.emit(WorkspaceServiceEvent.BranchChanged, {
          taskId: assoc.taskId,
          branchName: newBranch,
        });
      }
    }
  }

  private async handleGitStateChanged({
    repoPath,
  }: {
    repoPath: string;
  }): Promise<void> {
    const associations = this.getAllTaskAssociations();

    for (const assoc of associations) {
      if (assoc.mode === "cloud" || !assoc.folderId) continue;

      const folderPath = this.getFolderPath(assoc.folderId);
      if (!folderPath) continue;

      if (assoc.mode === "worktree") {
        const worktreePath = deriveWorktreePath(folderPath, assoc.worktree);
        if (worktreePath !== repoPath) continue;

        const currentBranch = await getBranchFromPath(repoPath);
        if (currentBranch !== null && currentBranch !== assoc.branchName) {
          this.updateAssociationBranchName(assoc.taskId, currentBranch);
          this.emit(WorkspaceServiceEvent.BranchChanged, {
            taskId: assoc.taskId,
            branchName: currentBranch,
          });
        }
      } else if (assoc.mode === "local") {
        if (folderPath !== repoPath) continue;

        const localWorktreePath =
          await this.getLocalWorktreePathIfExists(folderPath);
        const branchPath = localWorktreePath ?? folderPath;
        const currentBranch = await getBranchFromPath(branchPath);

        if (currentBranch === null && localWorktreePath) {
          continue;
        }

        this.emit(WorkspaceServiceEvent.BranchChanged, {
          taskId: assoc.taskId,
          branchName: currentBranch,
        });
      }
    }
  }

  private updateAssociationBranchName(
    _taskId: string,
    _branchName: string,
  ): void {}

  private async getLocalWorktreePathIfExists(
    mainRepoPath: string,
  ): Promise<string | null> {
    try {
      const worktreeBasePath = getWorktreeLocation();
      const worktreeManager = new WorktreeManager({
        mainRepoPath,
        worktreeBasePath,
      });
      const localPath = worktreeManager.getLocalWorktreePath();
      const exists = await worktreeManager.localWorktreeExists();
      if (exists) {
        return localPath;
      }
      return null;
    } catch (error) {
      log.warn(`Error checking local worktree for ${mainRepoPath}:`, error);
      return null;
    }
  }

  async createWorkspace(options: CreateWorkspaceInput): Promise<WorkspaceInfo> {
    // Prevent concurrent workspace creation for the same task
    const existingPromise = this.creatingWorkspaces.get(options.taskId);
    if (existingPromise) {
      log.warn(
        `Workspace creation already in progress for task ${options.taskId}, waiting for existing operation`,
      );
      return existingPromise;
    }

    const promise = this.doCreateWorkspace(options);
    this.creatingWorkspaces.set(options.taskId, promise);

    try {
      return await promise;
    } finally {
      this.creatingWorkspaces.delete(options.taskId);
    }
  }

  private async doCreateWorkspace(
    options: CreateWorkspaceInput,
  ): Promise<WorkspaceInfo> {
    const {
      taskId,
      mainRepoPath,
      folderPath,
      mode,
      branch,
      useExistingBranch,
    } = options;

    const existingWorkspace = await this.getWorkspaceInfo(taskId);
    if (existingWorkspace) {
      log.info(
        `Workspace already exists for task ${taskId}, returning existing workspace`,
      );
      return existingWorkspace;
    }

    log.info(
      `Creating workspace for task ${taskId} in ${mainRepoPath} (mode: ${mode}, useExistingBranch: ${useExistingBranch})`,
    );

    const repository = this.repositoryRepo.findByPath(mainRepoPath);
    const repositoryId = repository?.id ?? null;

    if (mode === "cloud") {
      this.workspaceRepo.create({
        taskId,
        repositoryId,
        mode: "cloud",
      });

      return {
        taskId,
        mode,
        worktree: null,
        branchName: null,
        terminalSessionIds: [],
        hasStartScripts: false,
      };
    }

    if (mode === "local") {
      if (branch) {
        const currentBranch = await getCurrentBranch(folderPath);
        if (currentBranch === branch) {
          log.info(`Already on branch ${branch}, skipping checkout`);
        } else {
          log.info(`Creating/switching to branch ${branch} for task ${taskId}`);
          const saga = new CreateOrSwitchBranchSaga();
          const result = await saga.run({
            baseDir: folderPath,
            branchName: branch,
          });
          if (!result.success) {
            const message = `Could not switch to branch "${branch}". Please commit or stash your changes first.`;
            log.error(message, result.error);
            this.emitWorkspaceError(taskId, message);
            throw new Error(message);
          }
          if (result.data.created) {
            log.info(`Created and switched to new branch ${branch}`);
          } else {
            log.info(`Switched to existing branch ${branch}`);
          }
        }
      }

      this.workspaceRepo.create({
        taskId,
        repositoryId,
        mode: "local",
      });

      const [{ config }, workspaceEnv] = await Promise.all([
        loadConfig(folderPath, path.basename(folderPath)),
        buildWorkspaceEnv({
          taskId,
          folderPath,
          worktreePath: null,
          worktreeName: null,
          mode,
        }),
      ]);
      let terminalSessionIds: string[] = [];

      // Run init scripts
      const initScripts = normalizeScripts(config?.scripts?.init);
      if (initScripts.length > 0) {
        log.info(
          `Running ${initScripts.length} init script(s) for task ${taskId} (local mode)`,
        );
        const initResult =
          await this.ensureScriptRunner().executeScriptsWithTerminal(
            taskId,
            initScripts,
            "init",
            folderPath,
            { failFast: true, workspaceEnv },
          );
        terminalSessionIds = initResult.terminalSessionIds;

        if (!initResult.success) {
          log.error(`Init scripts failed for task ${taskId}`);
          throw new Error(
            `Workspace init failed: ${initResult.errors?.join(", ") || "Unknown error"}`,
          );
        }
      }

      // Run start scripts
      const startScripts = normalizeScripts(config?.scripts?.start);
      if (startScripts.length > 0) {
        log.info(
          `Running ${startScripts.length} start script(s) for task ${taskId} (local mode)`,
        );
        const startResult =
          await this.ensureScriptRunner().executeScriptsWithTerminal(
            taskId,
            startScripts,
            "start",
            folderPath,
            { failFast: false, workspaceEnv },
          );
        terminalSessionIds = [
          ...terminalSessionIds,
          ...startResult.terminalSessionIds,
        ];

        if (!startResult.success) {
          log.warn(
            `Some start scripts failed for task ${taskId}: ${startResult.errors?.join(", ")}`,
          );
          this.emitWorkspaceError(
            taskId,
            `Start scripts failed: ${startResult.errors?.join(", ")}`,
          );
        }
      }

      const localBranch = await getBranchFromPath(folderPath);
      return {
        taskId,
        mode,
        worktree: null,
        branchName: localBranch,
        terminalSessionIds,
        hasStartScripts: startScripts.length > 0,
      };
    }

    // Worktree mode: create isolated worktree
    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });
    let worktree: WorktreeInfo;

    try {
      const defaultBranch = await getDefaultBranch(mainRepoPath).catch(
        () => "main",
      );
      const selectedBranch = branch ?? defaultBranch;
      const isTrunkSelected = selectedBranch === defaultBranch;

      if (isTrunkSelected) {
        log.info(
          `Trunk branch selected (${defaultBranch}), creating detached worktree`,
        );
        worktree = await worktreeManager.createWorktree({
          baseBranch: defaultBranch,
        });
        log.info(
          `Created detached worktree from trunk: ${worktree.worktreeName} at ${worktree.worktreePath}`,
        );
      } else {
        log.info(
          `Non-trunk branch selected (${selectedBranch}), attempting checkout`,
        );
        try {
          worktree =
            await worktreeManager.createWorktreeForExistingBranch(
              selectedBranch,
            );
          log.info(
            `Created worktree with branch checkout: ${worktree.worktreeName} at ${worktree.worktreePath} (branch: ${selectedBranch})`,
          );
        } catch (checkoutError) {
          const errorMessage =
            checkoutError instanceof Error
              ? checkoutError.message
              : String(checkoutError);
          if (errorMessage.includes("is already used by worktree")) {
            log.info(
              `Branch ${selectedBranch} is occupied, falling back to detached worktree`,
            );
            worktree = await worktreeManager.createWorktree({
              baseBranch: selectedBranch,
            });
            log.info(
              `Created detached worktree from occupied branch: ${worktree.worktreeName} at ${worktree.worktreePath}`,
            );
          } else {
            throw checkoutError;
          }
        }
      }

      // Warn if worktree is empty but main repo has files
      const worktreeHasFiles = await hasTrackedFiles(worktree.worktreePath);
      if (!worktreeHasFiles) {
        const mainHasFiles = await hasAnyFiles(mainRepoPath);
        if (mainHasFiles) {
          log.warn(
            `Worktree ${worktree.worktreeName} is empty but main repo has files`,
          );
          this.emitWorkspaceWarning(
            taskId,
            "Workspace is empty",
            "No files are committed yet. Commit your files to see them in workspaces.",
          );
        }
      }
    } catch (error) {
      log.error(`Failed to create worktree for task ${taskId}:`, error);
      throw new Error(`Failed to create worktree: ${String(error)}`);
    }

    const createdWorkspace = this.workspaceRepo.create({
      taskId,
      repositoryId,
      mode: "worktree",
    });

    this.worktreeRepo.create({
      workspaceId: createdWorkspace.id,
      name: worktree.worktreeName,
      path: worktree.worktreePath,
    });

    const [{ config }, workspaceEnv] = await Promise.all([
      loadConfig(worktree.worktreePath, worktree.worktreeName),
      buildWorkspaceEnv({
        taskId,
        folderPath,
        worktreePath: worktree.worktreePath,
        worktreeName: worktree.worktreeName,
        mode,
      }),
    ]);

    const initScripts = normalizeScripts(config?.scripts?.init);
    let terminalSessionIds: string[] = [];

    if (initScripts.length > 0) {
      log.info(
        `Running ${initScripts.length} init script(s) for task ${taskId}`,
      );
      const initResult =
        await this.ensureScriptRunner().executeScriptsWithTerminal(
          taskId,
          initScripts,
          "init",
          worktree.worktreePath,
          { failFast: true, workspaceEnv },
        );

      terminalSessionIds = initResult.terminalSessionIds;

      if (!initResult.success) {
        // Cleanup on init failure
        log.error(
          `Init scripts failed for task ${taskId}, cleaning up worktree`,
        );
        await this.cleanupWorktree(
          taskId,
          mainRepoPath,
          worktree.worktreePath,
          worktree.branchName ?? null,
        );
        throw new Error(
          `Workspace init failed: ${initResult.errors?.join(", ") || "Unknown error"}`,
        );
      }
    }

    // Run start scripts (don't fail on error, just notify)
    const startScripts = normalizeScripts(config?.scripts?.start);
    if (startScripts.length > 0) {
      log.info(
        `Running ${startScripts.length} start script(s) for task ${taskId}`,
      );
      const startResult =
        await this.ensureScriptRunner().executeScriptsWithTerminal(
          taskId,
          startScripts,
          "start",
          worktree.worktreePath,
          { failFast: false, workspaceEnv },
        );

      terminalSessionIds = [
        ...terminalSessionIds,
        ...startResult.terminalSessionIds,
      ];

      if (!startResult.success) {
        log.warn(
          `Some start scripts failed for task ${taskId}: ${startResult.errors?.join(", ")}`,
        );
        // Emit error to renderer for toast notification
        this.emitWorkspaceError(
          taskId,
          `Start scripts failed: ${startResult.errors?.join(", ")}`,
        );
      }
    }

    return {
      taskId,
      mode,
      worktree,
      branchName: worktree.branchName,
      terminalSessionIds,
      hasStartScripts: startScripts.length > 0,
    };
  }

  async deleteWorkspace(taskId: string, mainRepoPath: string): Promise<void> {
    log.info(`Deleting workspace for task ${taskId}`);

    const association = this.findTaskAssociation(taskId);
    if (!association) {
      log.warn(`No workspace found for task ${taskId}`);
      return;
    }

    if (association.mode === "cloud") {
      this.removeTaskAssociation(taskId);
      log.info(`Cloud workspace deleted for task ${taskId}`);
      return;
    }

    const folderId = association.folderId;
    const folderPath = this.getFolderPath(folderId);
    if (!folderPath) {
      log.warn(`No folder found for task ${taskId}, removing association only`);
      this.removeTaskAssociation(taskId);
      return;
    }

    let scriptPath: string;
    let scriptName: string;
    let worktreePath: string | null = null;
    let worktreeName: string | null = null;

    if (association.mode === "worktree") {
      worktreeName = association.worktree;
      worktreePath = deriveWorktreePath(folderPath, worktreeName);
      scriptPath = worktreePath;
      scriptName = worktreeName;
    } else {
      scriptPath = folderPath;
      scriptName = path.basename(folderPath);
    }

    const { config } = await loadConfig(scriptPath, scriptName);
    const destroyScripts = normalizeScripts(config?.scripts?.destroy);

    if (destroyScripts.length > 0) {
      log.info(
        `Running ${destroyScripts.length} destroy script(s) for task ${taskId}`,
      );

      const workspaceEnv = await buildWorkspaceEnv({
        taskId,
        folderPath,
        worktreePath,
        worktreeName,
        mode: association.mode,
      });

      const destroyResult =
        await this.ensureScriptRunner().executeScriptsSilent(
          destroyScripts,
          scriptPath,
          workspaceEnv,
        );

      if (!destroyResult.success) {
        log.warn(
          `Some destroy scripts failed for task ${taskId}: ${destroyResult.errors.join(", ")}`,
        );
        this.emitWorkspaceError(
          taskId,
          `Destroy scripts failed: ${destroyResult.errors.join(", ")}`,
        );
      }
    }

    await this.agentService.cancelSessionsByTaskId(taskId);
    this.processTracking.killByTaskId(taskId);
    this.ensureScriptRunner().cleanupTaskSessions(taskId);

    if (association.mode === "worktree" && worktreePath) {
      await this.cleanupWorktree(
        taskId,
        mainRepoPath,
        worktreePath,
        association.branchName,
      );

      const otherWorkspacesForFolder = this.getAllTaskAssociations().filter(
        (a) =>
          a.folderId === folderId &&
          a.taskId !== taskId &&
          a.mode === "worktree",
      );

      if (otherWorkspacesForFolder.length === 0) {
        await this.cleanupRepoWorktreeFolder(folderPath);
      }
    }

    this.removeTaskAssociation(taskId);

    log.info(`Workspace deleted for task ${taskId}`);
  }

  private removeTaskAssociation(taskId: string): void {
    const workspace = this.workspaceRepo.findByTaskId(taskId);
    if (workspace) {
      this.worktreeRepo.deleteByWorkspaceId(workspace.id);
    }
    this.workspaceRepo.deleteByTaskId(taskId);
  }

  private async cleanupRepoWorktreeFolder(folderPath: string): Promise<void> {
    const worktreeBasePath = getWorktreeLocation();
    const repoName = path.basename(folderPath);
    const repoWorktreeFolderPath = path.join(worktreeBasePath, repoName);

    // Safety check 1: Never delete the project folder itself
    if (path.resolve(repoWorktreeFolderPath) === path.resolve(folderPath)) {
      log.warn(
        `Skipping cleanup of worktree folder: path matches project folder (${folderPath})`,
      );
      return;
    }

    if (!fs.existsSync(repoWorktreeFolderPath)) {
      return;
    }

    const allFolders = this.repositoryRepo.findAll();
    const otherFoldersWithSameName = allFolders.filter(
      (f) => f.path !== folderPath && path.basename(f.path) === repoName,
    );

    if (otherFoldersWithSameName.length > 0) {
      log.info(
        `Skipping cleanup of worktree folder ${repoWorktreeFolderPath}: used by other folders: ${otherFoldersWithSameName.map((f) => f.path).join(", ")}`,
      );
      return;
    }

    try {
      // Safety check 3: Only delete if empty (ignoring .DS_Store)
      const files = fs.readdirSync(repoWorktreeFolderPath);
      const validFiles = files.filter((f) => f !== ".DS_Store");

      if (validFiles.length > 0) {
        log.info(
          `Skipping cleanup of worktree folder ${repoWorktreeFolderPath}: folder not empty (contains: ${validFiles.slice(0, 3).join(", ")}${validFiles.length > 3 ? "..." : ""})`,
        );
        return;
      }

      fs.rmSync(repoWorktreeFolderPath, { recursive: true, force: true });
      log.info(`Cleaned up worktree folder at ${repoWorktreeFolderPath}`);
    } catch (error) {
      log.warn(
        `Failed to cleanup worktree folder at ${repoWorktreeFolderPath}:`,
        error,
      );
    }
  }

  async verifyWorkspaceExists(
    taskId: string,
  ): Promise<{ exists: boolean; missingPath?: string }> {
    const association = this.findTaskAssociation(taskId);
    if (!association) {
      return { exists: false };
    }

    if (association.mode === "cloud") {
      return { exists: true };
    }

    const folderPath = this.getFolderPath(association.folderId);
    if (!folderPath) {
      this.removeTaskAssociation(taskId);
      return { exists: false, missingPath: "(folder not found)" };
    }

    if (association.mode === "local") {
      const exists = fs.existsSync(folderPath);
      if (!exists) {
        log.info(
          `Folder for task ${taskId} no longer exists, removing association`,
        );
        this.removeTaskAssociation(taskId);
        return { exists: false, missingPath: folderPath };
      }
      return { exists: true };
    }

    if (association.mode === "worktree") {
      const worktreePath = deriveWorktreePath(folderPath, association.worktree);
      const exists = fs.existsSync(worktreePath);
      if (!exists) {
        log.info(
          `Worktree for task ${taskId} no longer exists, removing association`,
        );
        this.removeTaskAssociation(taskId);
        return { exists: false, missingPath: worktreePath };
      }
      return { exists: true };
    }

    return { exists: false };
  }

  async runStartScripts(
    taskId: string,
    worktreePath: string,
    worktreeName: string,
  ): Promise<ScriptExecutionResult> {
    log.info(`Running start scripts for task ${taskId}`);

    const { config } = await loadConfig(worktreePath, worktreeName);
    const startScripts = normalizeScripts(config?.scripts?.start);

    if (startScripts.length === 0) {
      return { success: true, terminalSessionIds: [] };
    }

    const association = this.findTaskAssociation(taskId);
    const folderPath = association?.folderId
      ? this.getFolderPath(association.folderId)
      : null;
    const workspaceEnv = await buildWorkspaceEnv({
      taskId,
      folderPath: folderPath ?? worktreePath,
      worktreePath,
      worktreeName,
      mode: association?.mode ?? "worktree",
    });

    const result = await this.ensureScriptRunner().executeScriptsWithTerminal(
      taskId,
      startScripts,
      "start",
      worktreePath,
      { failFast: false, workspaceEnv },
    );

    if (!result.success) {
      this.emitWorkspaceError(
        taskId,
        `Start scripts failed: ${result.errors?.join(", ")}`,
      );
    }

    return result;
  }

  async getWorkspaceInfo(taskId: string): Promise<WorkspaceInfo | null> {
    const association = this.findTaskAssociation(taskId);
    if (!association) {
      return null;
    }

    if (association.mode === "cloud") {
      return {
        taskId,
        mode: "cloud",
        worktree: null,
        branchName: null,
        terminalSessionIds: [],
      };
    }

    const folderPath = association.folderId
      ? this.getFolderPath(association.folderId)
      : null;
    let worktreeInfo: WorktreeInfo | null = null;
    let branchName: string | null = null;

    if (association.mode === "worktree") {
      if (folderPath) {
        const worktreePath = deriveWorktreePath(
          folderPath,
          association.worktree,
        );
        const gitBranch = await getBranchFromPath(worktreePath);
        branchName = gitBranch ?? association.branchName;
        worktreeInfo = {
          worktreePath,
          worktreeName: association.worktree,
          branchName,
          baseBranch: "main",
          createdAt: new Date().toISOString(),
        };
      }
    } else if (association.mode === "local" && folderPath) {
      branchName = await getBranchFromPath(folderPath);
    }

    return {
      taskId,
      mode: association.mode,
      worktree: worktreeInfo,
      branchName,
      terminalSessionIds: this.ensureScriptRunner().getTaskSessions(taskId),
    };
  }

  isWorkspaceRunning(taskId: string): boolean {
    const sessions = this.ensureScriptRunner().getTaskSessions(taskId);
    return sessions.length > 0;
  }

  getWorkspaceTerminals(taskId: string): WorkspaceTerminalInfo[] {
    const sessionIds = this.ensureScriptRunner().getTaskSessions(taskId);
    const terminals: WorkspaceTerminalInfo[] = [];

    for (const sessionId of sessionIds) {
      const info = this.ensureScriptRunner().getSessionInfo(sessionId);
      if (info) {
        terminals.push(info);
      }
    }

    return terminals;
  }

  async getAllWorkspaces(): Promise<Record<string, Workspace>> {
    const associations = this.getAllTaskAssociations();
    const workspaces: Record<string, Workspace> = {};

    for (const assoc of associations) {
      if (assoc.mode === "cloud") {
        workspaces[assoc.taskId] = {
          taskId: assoc.taskId,
          folderId: assoc.folderId ?? "",
          folderPath: "",
          mode: "cloud",
          worktreePath: null,
          worktreeName: null,
          branchName: null,
          baseBranch: null,
          createdAt: new Date().toISOString(),
          terminalSessionIds: [],
          hasStartScripts: false,
        };
        continue;
      }

      const folderPath = this.getFolderPath(assoc.folderId);
      if (!folderPath) continue;

      let configPath: string;
      let configName: string;
      let worktreePath: string | null = null;
      let worktreeName: string | null = null;

      if (assoc.mode === "worktree") {
        worktreeName = assoc.worktree;
        worktreePath = deriveWorktreePath(folderPath, worktreeName);
        configPath = worktreePath;
        configName = worktreeName;
      } else {
        configPath = folderPath;
        configName = path.basename(folderPath);
      }

      let startScripts: string[] = [];
      try {
        const { config } = await loadConfig(configPath, configName);
        startScripts = normalizeScripts(config?.scripts?.start);
      } catch {
        /* config load failed, no start scripts */
      }

      let branchName: string | null = null;
      if (assoc.mode === "worktree" && worktreePath) {
        const gitBranch = await getBranchFromPath(worktreePath);
        branchName = gitBranch ?? assoc.branchName;
      } else if (assoc.mode === "local") {
        const localWorktreePath =
          await this.getLocalWorktreePathIfExists(folderPath);
        const branchPath = localWorktreePath ?? folderPath;
        branchName = await getBranchFromPath(branchPath);
      }

      workspaces[assoc.taskId] = {
        taskId: assoc.taskId,
        folderId: assoc.folderId,
        folderPath,
        mode: assoc.mode,
        worktreePath,
        worktreeName,
        branchName,
        baseBranch: null,
        createdAt: new Date().toISOString(),
        terminalSessionIds: this.ensureScriptRunner().getTaskSessions(
          assoc.taskId,
        ),
        hasStartScripts: startScripts.length > 0,
      };
    }

    return workspaces;
  }

  /**
   * Promote a local-mode task to worktree mode on an existing branch.
   * This is used when focusing on another workspace would disrupt a local-mode task.
   * The task gets its own worktree so it can continue working undisturbed.
   */
  async promoteToWorktree(
    taskId: string,
    mainRepoPath: string,
    branch: string,
  ): Promise<WorktreeInfo | null> {
    log.info(`Promoting task ${taskId} to worktree mode on branch ${branch}`);

    const association = this.findTaskAssociation(taskId);
    if (!association) {
      log.warn(`No association found for task ${taskId}`);
      return null;
    }

    if (association.mode !== "local") {
      log.warn(`Task ${taskId} is not in local mode, cannot promote`);
      return null;
    }

    const worktreeBasePath = getWorktreeLocation();
    const worktreeManager = new WorktreeManager({
      mainRepoPath,
      worktreeBasePath,
    });

    let worktree: WorktreeInfo;
    try {
      const currentBranch = await getCurrentBranch(mainRepoPath);
      if (currentBranch === branch) {
        log.info(
          `Main repo is on target branch ${branch}, detaching before creating worktree`,
        );
        const detachSaga = new DetachHeadSaga();
        const detachResult = await detachSaga.run({ baseDir: mainRepoPath });
        if (!detachResult.success) {
          throw new Error(`Failed to detach HEAD: ${detachResult.error}`);
        }
      }

      worktree = await worktreeManager.createWorktreeForExistingBranch(branch);
      log.info(
        `Created worktree for promoted task: ${worktree.worktreeName} at ${worktree.worktreePath}`,
      );
    } catch (error) {
      log.error(
        `Failed to create worktree for promoted task ${taskId}:`,
        error,
      );
      throw new Error(`Failed to promote task to worktree: ${String(error)}`);
    }

    const workspace = this.workspaceRepo.findByTaskId(taskId);
    if (workspace) {
      this.workspaceRepo.updateMode(taskId, "worktree");
      this.worktreeRepo.create({
        workspaceId: workspace.id,
        name: worktree.worktreeName,
        path: worktree.worktreePath,
      });
      log.info(`Updated task ${taskId} association to worktree mode`);
    }

    this.emit(WorkspaceServiceEvent.Promoted, {
      taskId,
      worktree,
      fromBranch: branch,
    });

    return worktree;
  }

  getLocalTasksForFolder(folderPath: string): Array<{ taskId: string }> {
    const associations = this.getAllTaskAssociations();
    const folder = this.repositoryRepo.findByPath(folderPath);
    if (!folder) return [];

    return associations
      .filter((a) => a.mode === "local" && a.folderId === folder.id)
      .map((a) => ({ taskId: a.taskId }));
  }

  getWorktreeTasks(worktreePath: string): Array<{ taskId: string }> {
    const associations = this.getAllTaskAssociations();
    const result: Array<{ taskId: string }> = [];

    for (const assoc of associations) {
      if (assoc.mode !== "worktree") continue;
      const folderPath = this.getFolderPath(assoc.folderId);
      if (!folderPath) continue;
      const derivedPath = deriveWorktreePath(folderPath, assoc.worktree);
      if (derivedPath === worktreePath) {
        result.push({ taskId: assoc.taskId });
      }
    }

    return result;
  }

  private async cleanupWorktree(
    taskId: string,
    mainRepoPath: string,
    worktreePath: string,
    branchName: string | null,
  ): Promise<void> {
    try {
      const fileWatcher = container.get<FileWatcherService>(
        MAIN_TOKENS.FileWatcherService,
      );
      await fileWatcher.stopWatching(worktreePath);
    } catch (error) {
      log.warn(
        `Failed to stop file watcher for worktree ${worktreePath}:`,
        error,
      );
    }

    try {
      const worktreeBasePath = getWorktreeLocation();
      const manager = new WorktreeManager({ mainRepoPath, worktreeBasePath });
      await manager.deleteWorktree(worktreePath);
    } catch (error) {
      log.error(`Failed to delete worktree for task ${taskId}:`, error);
    }

    if (branchName) {
      try {
        const git = createGitClient(mainRepoPath);
        await git.deleteLocalBranch(branchName, true);
        log.info(`Deleted branch ${branchName} for task ${taskId}`);
      } catch (error) {
        log.warn(
          `Failed to delete branch ${branchName} for task ${taskId}:`,
          error,
        );
      }
    }
  }

  private emitWorkspaceError(taskId: string, message: string): void {
    this.emit(WorkspaceServiceEvent.Error, { taskId, message });
  }

  private emitWorkspaceWarning(
    taskId: string,
    title: string,
    message: string,
  ): void {
    this.emit(WorkspaceServiceEvent.Warning, { taskId, title, message });
  }
}
