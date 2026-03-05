import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { WorktreeManager } from "@twig/git/worktree";
import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      if (name === "home") return os.homedir();
      if (name === "userData") return os.tmpdir();
      return os.tmpdir();
    },
  },
}));

let testWorktreeBasePath = "";
vi.mock("../settingsStore.js", () => ({
  getWorktreeLocation: () => testWorktreeBasePath,
}));

import type { IRepositoryRepository } from "../../db/repositories/repository-repository";
import { createMockRepositoryRepository } from "../../db/repositories/repository-repository.mock";
import {
  createMockWorkspaceRepository,
  type MockWorkspaceRepository,
} from "../../db/repositories/workspace-repository.mock";
import {
  createMockWorktreeRepository,
  type MockWorktreeRepository,
} from "../../db/repositories/worktree-repository.mock";
import { ArchiveService } from "./service";

async function createTempGitRepo(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync("git config user.email 'test@test.com'", {
    cwd: dir,
    stdio: "pipe",
  });
  execSync("git config user.name 'Test'", { cwd: dir, stdio: "pipe" });
  await fs.writeFile(path.join(dir, "README.md"), "# Test Repo");
  execSync("git add . && git commit -m 'Initial commit'", {
    cwd: dir,
    stdio: "pipe",
  });
  return dir;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const TASK_ID = "task-1";

interface TestContext {
  service: ArchiveService;
  repositoryRepo: IRepositoryRepository;
  workspaceRepo: MockWorkspaceRepository;
  worktreeRepo: MockWorktreeRepository;
  repoPath: string;
  repoId: string;
  worktreeBasePath: string;
  archiveInput: () => { taskId: string };
  setupWorktree: (
    method: "detached" | "branch",
    branchName?: string,
  ) => Promise<{ worktreePath: string; worktreeName: string }>;
  git: (cmd: string) => string;
}

interface CreateTestContextOpts {
  mode?: "local" | "cloud" | "worktree";
  hasWorkspace?: boolean;
  isArchived?: boolean;
  failOnArchive?: boolean;
  failOnUnarchive?: boolean;
  failOnWorktreeCreate?: boolean;
  failOnWorktreeDelete?: boolean;
}

async function withTestContext(
  opts: CreateTestContextOpts,
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-int-"));
  const repoPath = await createTempGitRepo();
  const worktreeBasePath = path.join(tempDir, "worktrees");
  await fs.mkdir(worktreeBasePath, { recursive: true });

  testWorktreeBasePath = worktreeBasePath;

  const repositoryRepo = createMockRepositoryRepository();
  const workspaceRepo = createMockWorkspaceRepository({
    failOnArchive: opts.failOnArchive,
    failOnUnarchive: opts.failOnUnarchive,
  });
  const worktreeRepo = createMockWorktreeRepository({
    failOnCreate: opts.failOnWorktreeCreate,
    failOnDelete: opts.failOnWorktreeDelete,
  });

  const repo = repositoryRepo.create({ path: repoPath });
  const repoId = repo.id;

  const mocks = {
    agentService: { cancelSessionsByTaskId: vi.fn() },
    processTracking: { killByTaskId: vi.fn() },
    fileWatcher: { stopWatching: vi.fn() },
  };

  const service = new ArchiveService(
    mocks.agentService as never,
    mocks.processTracking as never,
    mocks.fileWatcher as never,
    repositoryRepo as never,
    workspaceRepo as never,
    worktreeRepo as never,
  );

  const git = (cmd: string) =>
    execSync(`git ${cmd}`, {
      cwd: repoPath,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();

  const archiveInput = () => ({ taskId: TASK_ID });

  const setupWorktree = async (
    method: "detached" | "branch",
    branchName?: string,
  ) => {
    const manager = new WorktreeManager({
      mainRepoPath: repoPath,
      worktreeBasePath,
    });
    const result =
      method === "detached"
        ? await manager.createDetachedWorktreeAtCommit("HEAD", "test-wt")
        : await manager.createWorktreeForExistingBranch(
            branchName ?? "",
            "test-wt",
          );

    const workspace = workspaceRepo.createActive({
      taskId: TASK_ID,
      repositoryId: repoId,
      mode: "worktree",
    });

    worktreeRepo.create({
      workspaceId: workspace.id,
      name: result.worktreeName,
      path: result.worktreePath,
      branch: result.branchName ?? "HEAD",
    });

    return result;
  };

  if (opts.hasWorkspace !== false && opts.mode && opts.mode !== "worktree") {
    workspaceRepo.createActive({
      taskId: TASK_ID,
      repositoryId: repoId,
      mode: opts.mode,
    });

    if (opts.isArchived) {
      workspaceRepo.archive(TASK_ID, {
        worktreeName: null,
        branchName: null,
        checkpointId: null,
      });
    }
  }

  const ctx: TestContext = {
    service,
    repositoryRepo,
    workspaceRepo,
    worktreeRepo,
    repoPath,
    repoId,
    worktreeBasePath,
    archiveInput,
    setupWorktree,
    git,
  };

  try {
    await fn(ctx);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(repoPath, { recursive: true, force: true });
  }
}

describe("ArchiveService integration", () => {
  describe("worktree mode", () => {
    it("archive and unarchive preserves uncommitted changes", () =>
      withTestContext({}, async (ctx) => {
        const { worktreePath, worktreeName } =
          await ctx.setupWorktree("detached");
        await fs.writeFile(
          path.join(worktreePath, "work.txt"),
          "my precious work",
        );

        const archived = await ctx.service.archiveTask(ctx.archiveInput());

        expect(await pathExists(worktreePath)).toBe(false);
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(1);
        expect(archived.checkpointId).toBeTruthy();
        expect(ctx.workspaceRepo.findAllActive()).toHaveLength(0);

        const result = await ctx.service.unarchiveTask(TASK_ID);

        expect(result.worktreeName).toBe(worktreeName);
        const repoName = path.basename(ctx.repoPath);
        const newWorktreePath = path.join(
          ctx.worktreeBasePath,
          result.worktreeName ?? "",
          repoName,
        );
        expect(await pathExists(newWorktreePath)).toBe(true);

        const content = await fs.readFile(
          path.join(newWorktreePath, "work.txt"),
          "utf8",
        );
        expect(content).toBe("my precious work");

        const activeWorkspaces = ctx.workspaceRepo.findAllActive();
        expect(activeWorkspaces).toHaveLength(1);
        expect(activeWorkspaces[0]).toMatchObject({
          taskId: TASK_ID,
          repositoryId: ctx.repoId,
          mode: "worktree",
        });
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
      }));

    it("archive and unarchive preserves branch name", () =>
      withTestContext({}, async (ctx) => {
        const branchName = "feature/my-branch";
        ctx.git(`checkout -b ${branchName}`);
        ctx.git("checkout -");

        const { worktreePath } = await ctx.setupWorktree("branch", branchName);

        const archived = await ctx.service.archiveTask(ctx.archiveInput());

        expect(archived.branchName).toBe(branchName);
        expect(await pathExists(worktreePath)).toBe(false);

        await ctx.service.unarchiveTask(TASK_ID);

        const activeWorkspaces = ctx.workspaceRepo.findAllActive();
        expect(activeWorkspaces).toHaveLength(1);

        const worktree = ctx.worktreeRepo.findByWorkspaceId(
          activeWorkspaces[0].id,
        );
        expect(worktree).toBeTruthy();
        expect(worktree?.branch).toBe(branchName);
      }));

    it("unarchive with recreateBranch creates new branch", () =>
      withTestContext({}, async (ctx) => {
        const branchName = "feature/old-branch";
        ctx.git(`checkout -b ${branchName}`);
        ctx.git("checkout -");

        const { worktreePath } = await ctx.setupWorktree("branch", branchName);
        await fs.writeFile(path.join(worktreePath, "work.txt"), "my work");

        await ctx.service.archiveTask(ctx.archiveInput());
        ctx.git(`branch -D ${branchName}`);

        const result = await ctx.service.unarchiveTask(TASK_ID, true);

        const repoName = path.basename(ctx.repoPath);
        const newWorktreePath = path.join(
          ctx.worktreeBasePath,
          result.worktreeName ?? "",
          repoName,
        );

        const currentBranch = execSync("git branch --show-current", {
          cwd: newWorktreePath,
          encoding: "utf8",
          stdio: "pipe",
        }).trim();
        expect(currentBranch).toBe(branchName);

        const content = await fs.readFile(
          path.join(newWorktreePath, "work.txt"),
          "utf8",
        );
        expect(content).toBe("my work");
      }));

    it("archive does not save branch name for detached HEAD", () =>
      withTestContext({}, async (ctx) => {
        const { worktreePath } = await ctx.setupWorktree("detached");

        const archived = await ctx.service.archiveTask(ctx.archiveInput());

        expect(archived.branchName).toBeNull();
        expect(await pathExists(worktreePath)).toBe(false);
      }));

    it("re-archiving task updates existing archived entry", () =>
      withTestContext({ mode: "local" }, async (ctx) => {
        await ctx.service.archiveTask(ctx.archiveInput());
        const firstArchivedAt =
          ctx.workspaceRepo.findArchivedByTaskId(TASK_ID)?.archivedAt;

        ctx.workspaceRepo.unarchive(TASK_ID);

        await new Promise((r) => setTimeout(r, 10));
        await ctx.service.archiveTask(ctx.archiveInput());

        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(1);
        expect(
          ctx.workspaceRepo.findArchivedByTaskId(TASK_ID)?.archivedAt,
        ).not.toBe(firstArchivedAt);
      }));

    it("archive finds worktree at legacy path format", () =>
      withTestContext({}, async (ctx) => {
        const repoName = path.basename(ctx.repoPath);
        const worktreeName = "legacy-wt";
        const legacyPath = path.join(
          ctx.worktreeBasePath,
          repoName,
          worktreeName,
        );

        await fs.mkdir(legacyPath, { recursive: true });
        ctx.git(`worktree add "${legacyPath}" HEAD --detach`);
        await fs.writeFile(
          path.join(legacyPath, "legacy.txt"),
          "legacy content",
        );

        const workspace = ctx.workspaceRepo.createActive({
          taskId: TASK_ID,
          repositoryId: ctx.repoId,
          mode: "worktree",
        });

        ctx.worktreeRepo.create({
          workspaceId: workspace.id,
          name: worktreeName,
          path: legacyPath,
          branch: "HEAD",
        });

        const archived = await ctx.service.archiveTask(ctx.archiveInput());

        expect(archived.checkpointId).toBeTruthy();
        expect(await pathExists(legacyPath)).toBe(false);
      }));
  });

  describe("local/cloud mode", () => {
    it.each(["local", "cloud"] as const)(
      "archive and unarchive %s mode restores correct workspace",
      (mode) =>
        withTestContext({ mode }, async (ctx) => {
          await ctx.service.archiveTask(ctx.archiveInput());

          expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(1);
          expect(ctx.workspaceRepo.findArchivedByTaskId(TASK_ID)?.mode).toBe(
            mode,
          );
          expect(
            ctx.workspaceRepo.findArchivedByTaskId(TASK_ID)?.checkpointId,
          ).toBeNull();
          expect(ctx.workspaceRepo.findAllActive()).toHaveLength(0);

          const result = await ctx.service.unarchiveTask(TASK_ID);

          expect(result.worktreeName).toBeNull();
          const activeWorkspaces = ctx.workspaceRepo.findAllActive();
          expect(activeWorkspaces).toHaveLength(1);
          expect(activeWorkspaces[0]).toMatchObject({
            taskId: TASK_ID,
            repositoryId: ctx.repoId,
            mode,
          });
          expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
        }),
    );
  });

  describe("error handling", () => {
    it("archives task without workspace association", () =>
      withTestContext({ hasWorkspace: false }, async (ctx) => {
        const result = await ctx.service.archiveTask({
          taskId: "nonexistent",
        });
        expect(result).toMatchObject({
          taskId: "nonexistent",
          folderId: "",
          mode: "cloud",
          worktreeName: null,
          branchName: null,
          checkpointId: null,
        });
      }));

    it("unarchives task without repository association", () =>
      withTestContext({}, async (ctx) => {
        ctx.workspaceRepo.createActive({
          taskId: TASK_ID,
          repositoryId: null,
          mode: "cloud",
        });
        ctx.workspaceRepo.archive(TASK_ID, {
          worktreeName: null,
          branchName: null,
          checkpointId: null,
        });

        const result = await ctx.service.unarchiveTask(TASK_ID);

        expect(result).toEqual({ taskId: TASK_ID, worktreeName: null });
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
        expect(ctx.workspaceRepo.findAllActive()).toHaveLength(1);
      }));

    it("throws when archived task not found for unarchive", () =>
      withTestContext({}, async (ctx) => {
        await expect(ctx.service.unarchiveTask("nonexistent")).rejects.toThrow(
          "Archived task not found",
        );
      }));

    it("throws when repository not found for archive", () =>
      withTestContext({}, async (ctx) => {
        ctx.workspaceRepo.createActive({
          taskId: TASK_ID,
          repositoryId: "missing-repo-id",
          mode: "local",
        });

        await expect(
          ctx.service.archiveTask(ctx.archiveInput()),
        ).rejects.toThrow("Repository not found");
      }));

    it("throws when repository not found for unarchive", () =>
      withTestContext({}, async (ctx) => {
        ctx.workspaceRepo.createActive({
          taskId: TASK_ID,
          repositoryId: "missing-repo-id",
          mode: "worktree",
        });
        ctx.workspaceRepo.archive(TASK_ID, {
          worktreeName: "test-wt",
          branchName: null,
          checkpointId: "worktree-test-wt",
        });

        await expect(ctx.service.unarchiveTask(TASK_ID)).rejects.toThrow(
          "Repository not found",
        );
      }));
  });

  describe("getters", () => {
    it("getArchivedTasks returns tasks from repository", () =>
      withTestContext({ mode: "local", isArchived: true }, async (ctx) => {
        const tasks = ctx.service.getArchivedTasks();
        expect(tasks).toHaveLength(1);
        expect(tasks[0].taskId).toBe(TASK_ID);

        expect(ctx.service.getArchivedTaskIds()).toEqual([TASK_ID]);
        expect(ctx.service.isArchived(TASK_ID)).toBe(true);
        expect(ctx.service.isArchived("task-2")).toBe(false);
      }));
  });

  describe("deleteArchivedTask", () => {
    it("deletes archived task without checkpoint", () =>
      withTestContext({ mode: "local", isArchived: true }, async (ctx) => {
        await ctx.service.deleteArchivedTask(TASK_ID);
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
        expect(ctx.workspaceRepo.findByTaskId(TASK_ID)).toBeNull();
      }));

    it("deletes archived task with checkpoint", () =>
      withTestContext({}, async (ctx) => {
        const { worktreePath } = await ctx.setupWorktree("detached");
        await fs.writeFile(path.join(worktreePath, "file.txt"), "content");

        const archived = await ctx.service.archiveTask(ctx.archiveInput());
        expect(archived.checkpointId).toBeTruthy();
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(1);

        const refs = ctx.git("for-each-ref --format='%(refname)'");
        expect(refs).toContain(archived.checkpointId);

        await ctx.service.deleteArchivedTask(TASK_ID);

        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
        const refsAfter = ctx.git("for-each-ref --format='%(refname)'");
        expect(refsAfter).not.toContain(archived.checkpointId);
      }));

    it("throws when archived task not found", () =>
      withTestContext({}, async (ctx) => {
        await expect(
          ctx.service.deleteArchivedTask("nonexistent"),
        ).rejects.toThrow("Archived task nonexistent not found");
      }));

    it("still removes from repository if checkpoint deletion fails", () =>
      withTestContext({}, async (ctx) => {
        ctx.workspaceRepo.createActive({
          taskId: TASK_ID,
          repositoryId: ctx.repoId,
          mode: "worktree",
        });
        ctx.workspaceRepo.archive(TASK_ID, {
          worktreeName: "nonexistent",
          branchName: null,
          checkpointId: "worktree-nonexistent",
        });

        await ctx.service.deleteArchivedTask(TASK_ID);
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
      }));

    it("still removes from repository if repository not found", () =>
      withTestContext({}, async (ctx) => {
        ctx.workspaceRepo.createActive({
          taskId: TASK_ID,
          repositoryId: "missing-folder",
          mode: "worktree",
        });
        ctx.workspaceRepo.archive(TASK_ID, {
          worktreeName: "test",
          branchName: null,
          checkpointId: "worktree-test",
        });

        await ctx.service.deleteArchivedTask(TASK_ID);
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
      }));
  });

  describe("rollback behavior", () => {
    it("archive rolls back if archive step fails", () =>
      withTestContext({ mode: "local", failOnArchive: true }, async (ctx) => {
        await expect(
          ctx.service.archiveTask(ctx.archiveInput()),
        ).rejects.toThrow("Injected failure");

        expect(ctx.workspaceRepo.findAllActive()).toHaveLength(1);
        expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(0);
      }));

    it("archive worktree rolls back checkpoint if worktree delete fails", () =>
      withTestContext({ failOnWorktreeDelete: true }, async (ctx) => {
        const { worktreeName } = await ctx.setupWorktree("detached");

        await expect(
          ctx.service.archiveTask(ctx.archiveInput()),
        ).rejects.toThrow("Injected failure");

        const refs = ctx.git("for-each-ref --format='%(refname)'");
        expect(refs).not.toContain(`worktree-${worktreeName}`);
      }));

    it("unarchive rolls back if unarchive step fails", () =>
      withTestContext(
        { mode: "local", isArchived: true, failOnUnarchive: true },
        async (ctx) => {
          await expect(ctx.service.unarchiveTask(TASK_ID)).rejects.toThrow(
            "Injected failure",
          );

          expect(ctx.workspaceRepo.findAllActive()).toHaveLength(0);
          expect(ctx.workspaceRepo.findAllArchived()).toHaveLength(1);
        },
      ));
  });
});
