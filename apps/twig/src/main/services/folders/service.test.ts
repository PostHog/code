import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockExistsSync = vi.hoisted(() => vi.fn(() => true));
const mockDialog = vi.hoisted(() => ({
  showMessageBox: vi.fn(),
}));
const mockRepositoryRepo = vi.hoisted(() => ({
  findAll: vi.fn(),
  findById: vi.fn(),
  findByPath: vi.fn(),
  findByRemoteUrl: vi.fn(),
  findMostRecentlyAccessed: vi.fn(),
  create: vi.fn(),
  upsertByPath: vi.fn(),
  updateLastAccessed: vi.fn(),
  updateRemoteUrl: vi.fn(),
  delete: vi.fn(),
}));
const mockWorkspaceRepo = vi.hoisted(() => ({
  findAllActiveByRepositoryId: vi.fn(),
  findAllActive: vi.fn(),
}));
const mockWorktreeRepo = vi.hoisted(() => ({
  findByWorkspaceId: vi.fn(),
  findAll: vi.fn(),
}));
const mockWorktreeManager = vi.hoisted(() => ({
  deleteWorktree: vi.fn(),
  cleanupOrphanedWorktrees: vi.fn(),
}));
const mockInitRepositorySaga = vi.hoisted(() => ({
  run: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  promises: {
    readdir: vi.fn(),
    readFile: vi.fn(),
  },
  default: {
    existsSync: mockExistsSync,
    promises: {
      readdir: vi.fn(),
      readFile: vi.fn(),
    },
  },
}));

vi.mock("electron", () => ({
  dialog: mockDialog,
}));

vi.mock("@twig/git/worktree", () => ({
  WorktreeManager: class MockWorktreeManager {
    deleteWorktree = mockWorktreeManager.deleteWorktree;
    cleanupOrphanedWorktrees = mockWorktreeManager.cleanupOrphanedWorktrees;
  },
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../../trpc/context.js", () => ({
  getMainWindow: vi.fn(() => ({ id: 1 })),
}));

vi.mock("@twig/git/queries", () => ({
  isGitRepository: vi.fn(() => Promise.resolve(true)),
  getRemoteUrl: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@twig/git/sagas/init", () => ({
  InitRepositorySaga: class {
    run = mockInitRepositorySaga.run;
  },
}));

vi.mock("../settingsStore.js", () => ({
  getWorktreeLocation: vi.fn(() => "/tmp/worktrees"),
}));

vi.mock("../../db/repositories/repository-repository.js", () => ({
  RepositoryRepository: vi.fn(() => mockRepositoryRepo),
}));

vi.mock("../../db/repositories/workspace-repository.js", () => ({
  WorkspaceRepository: vi.fn(() => mockWorkspaceRepo),
}));

vi.mock("../../db/repositories/worktree-repository.js", () => ({
  WorktreeRepository: vi.fn(() => mockWorktreeRepo),
}));

import { isGitRepository } from "@twig/git/queries";
import type { IRepositoryRepository } from "../../db/repositories/repository-repository.js";
import type { IWorkspaceRepository } from "../../db/repositories/workspace-repository.js";
import type { IWorktreeRepository } from "../../db/repositories/worktree-repository.js";
import { FoldersService } from "./service.js";

describe("FoldersService", () => {
  let service: FoldersService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockRepositoryRepo.findAll.mockReturnValue([]);
    mockWorkspaceRepo.findAllActiveByRepositoryId.mockReturnValue([]);
    mockWorkspaceRepo.findAllActive.mockReturnValue([]);
    mockWorktreeRepo.findAll.mockReturnValue([]);

    service = new FoldersService(
      mockRepositoryRepo as unknown as IRepositoryRepository,
      mockWorkspaceRepo as unknown as IWorkspaceRepository,
      mockWorktreeRepo as unknown as IWorktreeRepository,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("getFolders", () => {
    it("returns empty array when no folders registered", async () => {
      mockRepositoryRepo.findAll.mockReturnValue([]);

      const result = await service.getFolders();

      expect(result).toEqual([]);
    });

    it("returns folders with exists property", async () => {
      const repos = [
        {
          id: "folder-1",
          path: "/home/user/project",
          lastAccessedAt: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockRepositoryRepo.findAll.mockReturnValue(repos);
      mockExistsSync.mockReturnValue(true);

      const result = await service.getFolders();

      expect(result).toEqual([
        {
          id: "folder-1",
          path: "/home/user/project",
          name: "project",
          remoteUrl: null,
          lastAccessed: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          exists: true,
        },
      ]);
    });

    it("marks non-existent folders", async () => {
      const repos = [
        {
          id: "folder-1",
          path: "/nonexistent/path",
          lastAccessedAt: "2024-01-01T00:00:00.000Z",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ];
      mockRepositoryRepo.findAll.mockReturnValue(repos);
      mockExistsSync.mockReturnValue(false);

      const result = await service.getFolders();

      expect(result[0].exists).toBe(false);
    });
  });

  describe("addFolder", () => {
    it("adds a new folder when it is a git repository", async () => {
      vi.mocked(isGitRepository).mockResolvedValue(true);
      mockRepositoryRepo.findByPath.mockReturnValue(null);
      mockRepositoryRepo.create.mockReturnValue({
        id: "folder-new",
        path: "/home/user/my-project",
        remoteUrl: null,
        lastAccessedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await service.addFolder("/home/user/my-project");

      expect(result.name).toBe("my-project");
      expect(result.path).toBe("/home/user/my-project");
      expect(result.exists).toBe(true);
      expect(mockRepositoryRepo.create).toHaveBeenCalledWith({
        path: "/home/user/my-project",
        remoteUrl: undefined,
      });
    });

    it("throws error for invalid folder path", async () => {
      await expect(service.addFolder("")).rejects.toThrow(
        "Invalid folder path",
      );
    });

    it("prompts to initialize git for non-git folder", async () => {
      vi.mocked(isGitRepository).mockResolvedValue(false);
      mockDialog.showMessageBox.mockResolvedValue({ response: 0 });
      mockInitRepositorySaga.run.mockResolvedValue({
        success: true,
        data: { initialized: true },
      });
      mockRepositoryRepo.findByPath.mockReturnValue(null);
      mockRepositoryRepo.create.mockReturnValue({
        id: "folder-new",
        path: "/home/user/project",
        remoteUrl: null,
        lastAccessedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });

      const result = await service.addFolder("/home/user/project");

      expect(mockDialog.showMessageBox).toHaveBeenCalled();
      expect(mockInitRepositorySaga.run).toHaveBeenCalledWith({
        baseDir: "/home/user/project",
        initialCommit: true,
        commitMessage: "Initial commit",
      });
      expect(result.name).toBe("project");
    });

    it("throws error when user cancels git init", async () => {
      vi.mocked(isGitRepository).mockResolvedValue(false);
      mockDialog.showMessageBox.mockResolvedValue({ response: 1 });

      await expect(service.addFolder("/home/user/project")).rejects.toThrow(
        "Folder must be a git repository",
      );
    });
  });

  describe("removeFolder", () => {
    it("removes folder from database", async () => {
      mockRepositoryRepo.findById.mockReturnValue({
        id: "folder-1",
        path: "/home/user/project",
        lastAccessedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });
      mockWorkspaceRepo.findAllActiveByRepositoryId.mockReturnValue([]);

      await service.removeFolder("folder-1");

      expect(mockRepositoryRepo.delete).toHaveBeenCalledWith("folder-1");
    });

    it("removes associated worktrees", async () => {
      mockRepositoryRepo.findById.mockReturnValue({
        id: "folder-1",
        path: "/home/user/project",
        lastAccessedAt: "2024-01-01T00:00:00.000Z",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      });
      mockWorkspaceRepo.findAllActiveByRepositoryId.mockReturnValue([
        {
          id: "workspace-1",
          taskId: "task-1",
          repositoryId: "folder-1",
          mode: "worktree",
          state: "active",
        },
      ]);
      mockWorktreeRepo.findByWorkspaceId.mockReturnValue({
        id: "worktree-1",
        workspaceId: "workspace-1",
        name: "twig-task-1",
        path: "/tmp/worktrees/project/twig-task-1",
        branch: "main",
      });
      mockWorktreeManager.deleteWorktree.mockResolvedValue(undefined);

      await service.removeFolder("folder-1");

      expect(mockWorktreeManager.deleteWorktree).toHaveBeenCalled();
    });
  });

  describe("updateFolderAccessed", () => {
    it("updates lastAccessed timestamp", async () => {
      await service.updateFolderAccessed("folder-1");

      expect(mockRepositoryRepo.updateLastAccessed).toHaveBeenCalledWith(
        "folder-1",
      );
    });
  });

  describe("cleanupOrphanedWorktrees", () => {
    it("delegates to WorktreeManager", async () => {
      mockWorktreeRepo.findAll.mockReturnValue([]);
      mockWorktreeManager.cleanupOrphanedWorktrees.mockResolvedValue({
        deleted: ["/tmp/worktrees/project/orphan-1"],
        errors: [],
      });

      const result =
        await service.cleanupOrphanedWorktrees("/home/user/project");

      expect(result.deleted).toHaveLength(1);
      expect(result.errors).toHaveLength(0);
    });

    it("excludes associated worktrees from cleanup", async () => {
      mockWorktreeRepo.findAll.mockReturnValue([
        {
          id: "worktree-1",
          workspaceId: "workspace-1",
          name: "twig-task-1",
          path: "/tmp/worktrees/project/twig-task-1",
          branch: "main",
        },
      ]);
      mockWorktreeManager.cleanupOrphanedWorktrees.mockResolvedValue({
        deleted: [],
        errors: [],
      });

      await service.cleanupOrphanedWorktrees("/home/user/project");

      expect(mockWorktreeManager.cleanupOrphanedWorktrees).toHaveBeenCalledWith(
        ["/tmp/worktrees/project/twig-task-1"],
      );
    });
  });
});
