import fs from "node:fs";
import path from "node:path";
import { getRemoteUrl, isGitRepository } from "@twig/git/queries";
import { InitRepositorySaga } from "@twig/git/sagas/init";

function extractRepoKey(url: string): string | null {
  const httpsMatch = url.match(/github\.com\/([^/]+\/[^/]+)/);
  if (httpsMatch) return httpsMatch[1].replace(/\.git$/, "");

  const sshMatch = url.match(/github\.com:([^/]+\/[^/]+)/);
  if (sshMatch) return sshMatch[1].replace(/\.git$/, "");

  return null;
}

import { WorktreeManager } from "@twig/git/worktree";
import { dialog } from "electron";
import { inject, injectable } from "inversify";
import type {
  IRepositoryRepository,
  Repository,
} from "../../db/repositories/repository-repository.js";
import type { IWorkspaceRepository } from "../../db/repositories/workspace-repository.js";
import type { IWorktreeRepository } from "../../db/repositories/worktree-repository.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { getMainWindow } from "../../trpc/context.js";
import { logger } from "../../utils/logger.js";
import { getWorktreeLocation } from "../settingsStore.js";
import type {
  CleanupOrphanedWorktreesOutput,
  RegisteredFolder,
} from "./schemas.js";

const log = logger.scope("folders-service");

@injectable()
export class FoldersService {
  constructor(
    @inject(MAIN_TOKENS.RepositoryRepository)
    private readonly repositoryRepo: IRepositoryRepository,
    @inject(MAIN_TOKENS.WorkspaceRepository)
    private readonly workspaceRepo: IWorkspaceRepository,
    @inject(MAIN_TOKENS.WorktreeRepository)
    private readonly worktreeRepo: IWorktreeRepository,
  ) {}

  async getFolders(): Promise<(RegisteredFolder & { exists: boolean })[]> {
    const repos = this.repositoryRepo.findAll();
    return repos
      .filter((r) => r.path)
      .map((r) => ({
        id: r.id,
        path: r.path,
        name: path.basename(r.path),
        remoteUrl: r.remoteUrl ?? null,
        lastAccessed: r.lastAccessedAt ?? r.createdAt,
        createdAt: r.createdAt,
        exists: fs.existsSync(r.path),
      }));
  }

  async addFolder(
    folderPath: string,
  ): Promise<RegisteredFolder & { exists: boolean }> {
    const folderName = path.basename(folderPath);
    if (!folderPath || !folderName) {
      throw new Error(
        `Invalid folder path: "${folderPath}" - path must have a valid directory name`,
      );
    }

    const isRepo = await isGitRepository(folderPath);

    if (!isRepo) {
      const mainWindow = getMainWindow();
      if (!mainWindow) {
        throw new Error("This folder is not a git repository");
      }

      const result = await dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Initialize Git Repository",
        message: "This folder is not a git repository",
        detail: `Would you like to initialize git in "${path.basename(folderPath)}"?`,
        buttons: ["Initialize Git", "Cancel"],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 1) {
        throw new Error("Folder must be a git repository");
      }

      const saga = new InitRepositorySaga();
      const initResult = await saga.run({
        baseDir: folderPath,
        initialCommit: true,
        commitMessage: "Initial commit",
      });
      if (!initResult.success) {
        throw new Error(
          `Failed to initialize git repository: ${initResult.error}`,
        );
      }
    }

    const existingRepo = this.repositoryRepo.findByPath(folderPath);
    let repo: Repository;

    if (existingRepo) {
      this.repositoryRepo.updateLastAccessed(existingRepo.id);
      const updated = this.repositoryRepo.findById(existingRepo.id);
      if (!updated) {
        throw new Error(`Repository ${existingRepo.id} not found after update`);
      }
      repo = updated;

      if (!repo.remoteUrl) {
        const remoteUrl = await getRemoteUrl(folderPath);
        const repoKey = remoteUrl ? extractRepoKey(remoteUrl) : null;
        if (repoKey) {
          this.repositoryRepo.updateRemoteUrl(repo.id, repoKey);
          const refreshed = this.repositoryRepo.findById(repo.id);
          if (!refreshed) {
            throw new Error(
              `Repository ${repo.id} not found after remote URL update`,
            );
          }
          repo = refreshed;
        }
      }
    } else {
      const remoteUrl = await getRemoteUrl(folderPath);
      const repoKey = remoteUrl ? extractRepoKey(remoteUrl) : null;
      repo = this.repositoryRepo.create({
        path: folderPath,
        remoteUrl: repoKey ?? undefined,
      });
    }

    return {
      id: repo.id,
      path: repo.path,
      name: path.basename(repo.path),
      remoteUrl: repo.remoteUrl ?? null,
      lastAccessed: repo.lastAccessedAt ?? repo.createdAt,
      createdAt: repo.createdAt,
      exists: true,
    };
  }

  async removeFolder(folderId: string): Promise<void> {
    const repo = this.repositoryRepo.findById(folderId);
    if (!repo) {
      log.debug(`Folder not found: ${folderId}`);
      return;
    }

    const workspaces = this.workspaceRepo.findAllByRepositoryId(folderId);
    const worktreeBasePath = getWorktreeLocation();
    const repoName = path.basename(repo.path);

    for (const workspace of workspaces) {
      if (workspace.mode === "worktree") {
        const worktree = this.worktreeRepo.findByWorkspaceId(workspace.id);
        if (worktree) {
          const worktreePath = path.join(
            worktreeBasePath,
            repoName,
            worktree.name,
          );
          try {
            const manager = new WorktreeManager({
              mainRepoPath: repo.path,
              worktreeBasePath,
            });
            await manager.deleteWorktree(worktreePath);
          } catch (error) {
            log.error(`Failed to delete worktree ${worktreePath}:`, error);
          }
        }
      }
    }

    this.repositoryRepo.delete(folderId);
    log.debug(`Removed folder with ID: ${folderId}`);
  }

  async updateFolderAccessed(folderId: string): Promise<void> {
    this.repositoryRepo.updateLastAccessed(folderId);
  }

  async cleanupOrphanedWorktrees(
    mainRepoPath: string,
  ): Promise<CleanupOrphanedWorktreesOutput> {
    const worktreeBasePath = getWorktreeLocation();
    const manager = new WorktreeManager({ mainRepoPath, worktreeBasePath });

    const allWorktrees = this.worktreeRepo.findAll();
    const associatedWorktreePaths = allWorktrees.map((wt) => wt.path);

    return await manager.cleanupOrphanedWorktrees(associatedWorktreePaths);
  }

  getRepositoryByRemoteUrl(
    remoteUrl: string,
  ): { id: string; path: string } | null {
    const repo = this.repositoryRepo.findByRemoteUrl(remoteUrl);
    if (!repo) return null;
    return { id: repo.id, path: repo.path };
  }

  getMostRecentlyAccessedRepository(): { id: string; path: string } | null {
    const repo = this.repositoryRepo.findMostRecentlyAccessed();
    if (!repo) return null;
    return { id: repo.id, path: repo.path };
  }

  async clearAllData(): Promise<void> {
    const workspaces = this.workspaceRepo.findAll();
    const worktreeBasePath = getWorktreeLocation();

    for (const workspace of workspaces) {
      if (workspace.mode === "worktree" && workspace.repositoryId) {
        const repo = this.repositoryRepo.findById(workspace.repositoryId);
        const worktree = this.worktreeRepo.findByWorkspaceId(workspace.id);
        if (repo && worktree) {
          try {
            const manager = new WorktreeManager({
              mainRepoPath: repo.path,
              worktreeBasePath,
            });
            await manager.deleteWorktree(worktree.path);
          } catch (error) {
            log.error(`Failed to delete worktree ${worktree.path}:`, error);
          }
        }
      }
    }

    this.worktreeRepo.deleteAll();
    this.workspaceRepo.deleteAll();
    this.repositoryRepo.deleteAll();

    log.info("Cleared all application data");
  }
}
