import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TaskFolderAssociation } from "@shared/types";
import type { ArchivedTask } from "@shared/types/archive";
import { WorktreeManager } from "@twig/git/worktree";
import { describe, expect, it, vi } from "vitest";
import { ArchiveService } from "./service";

interface FoldersStoreData {
  folders: Array<{ id: string; path: string; name: string }>;
  taskAssociations: TaskFolderAssociation[];
  [key: string]: unknown;
}

interface ArchiveStoreData {
  archivedTasks: ArchivedTask[];
  [key: string]: unknown;
}

interface SettingsStoreData {
  worktreeLocation: string;
  [key: string]: unknown;
}

function createInMemoryStore<T extends Record<string, unknown>>(
  initial: T,
  opts?: { failOnSetKey?: keyof T; failAfterNCalls?: number },
) {
  const data = structuredClone(initial);
  let setCalls = 0;
  return {
    get: <K extends keyof T>(key: K, defaultVal?: T[K]): T[K] =>
      (data[key] as T[K]) ?? (defaultVal as T[K]),
    set: <K extends keyof T>(key: K, value: T[K]) => {
      setCalls++;
      if (opts?.failOnSetKey === key) {
        if (!opts.failAfterNCalls || setCalls > opts.failAfterNCalls) {
          throw new Error(`Injected failure on set("${String(key)}")`);
        }
      }
      (data[key] as T[K]) = value;
    },
  };
}

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

const FOLDER_ID = "folder-1";
const TASK_ID = "task-1";

interface TestContext {
  service: ArchiveService;
  foldersStore: ReturnType<typeof createInMemoryStore<FoldersStoreData>>;
  archiveStore: ReturnType<typeof createInMemoryStore<ArchiveStoreData>>;
  repoPath: string;
  worktreeBasePath: string;
  archiveInput: () => {
    taskId: string;
  };
  setupWorktree: (
    method: "detached" | "branch",
    branchName?: string,
  ) => Promise<{ worktreePath: string; worktreeName: string }>;
  git: (cmd: string) => string;
}

interface CreateTestContextOpts {
  associations?: TaskFolderAssociation[];
  archivedTasks?: ArchivedTask[];
  folders?: Array<{ id: string; path: string; name: string }> | "none";
  failOnSet?: {
    store: "folders" | "archive";
    key: "taskAssociations" | "archivedTasks";
    afterNCalls?: number;
  };
}

async function withTestContext(
  opts: CreateTestContextOpts,
  fn: (ctx: TestContext) => Promise<void>,
): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "archive-int-"));
  const repoPath = await createTempGitRepo();
  const worktreeBasePath = path.join(tempDir, "worktrees");
  await fs.mkdir(worktreeBasePath, { recursive: true });

  const repoName = path.basename(repoPath);
  const defaultFolders = [{ id: FOLDER_ID, path: repoPath, name: repoName }];

  const foldersStore = createInMemoryStore<FoldersStoreData>(
    {
      folders: opts.folders === "none" ? [] : (opts.folders ?? defaultFolders),
      taskAssociations: opts.associations ?? [],
    },
    opts.failOnSet?.store === "folders"
      ? {
          failOnSetKey: opts.failOnSet.key,
          failAfterNCalls: opts.failOnSet.afterNCalls,
        }
      : undefined,
  );
  const archiveStore = createInMemoryStore<ArchiveStoreData>(
    { archivedTasks: opts.archivedTasks ?? [] },
    opts.failOnSet?.store === "archive"
      ? {
          failOnSetKey: opts.failOnSet.key,
          failAfterNCalls: opts.failOnSet.afterNCalls,
        }
      : undefined,
  );
  const settingsStore = createInMemoryStore<SettingsStoreData>({
    worktreeLocation: worktreeBasePath,
  });

  const mocks = {
    agentService: { cancelSessionsByTaskId: vi.fn() },
    processTracking: { killByTaskId: vi.fn() },
    fileWatcher: { stopWatching: vi.fn() },
  };

  const service = new ArchiveService(
    mocks.agentService as never,
    mocks.processTracking as never,
    mocks.fileWatcher as never,
    archiveStore as never,
    foldersStore as never,
    settingsStore as never,
  );

  const git = (cmd: string) =>
    execSync(`git ${cmd}`, {
      cwd: repoPath,
      encoding: "utf8",
      stdio: "pipe",
    }).trim();

  const archiveInput = () => ({
    taskId: TASK_ID,
  });

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
    foldersStore.set("taskAssociations", [
      worktreeAssociation(result.worktreeName),
    ]);
    return result;
  };

  const ctx: TestContext = {
    service,
    foldersStore,
    archiveStore,
    repoPath,
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

function worktreeAssociation(worktreeName: string): TaskFolderAssociation {
  return {
    taskId: TASK_ID,
    folderId: FOLDER_ID,
    mode: "worktree" as const,
    worktree: worktreeName,
    branchName: null,
  };
}

function simpleAssociation(mode: "local" | "cloud"): TaskFolderAssociation {
  return { taskId: TASK_ID, folderId: FOLDER_ID, mode };
}

function archivedTask(overrides: Partial<ArchivedTask> = {}): ArchivedTask {
  return {
    taskId: TASK_ID,
    archivedAt: new Date().toISOString(),
    folderId: FOLDER_ID,
    mode: "local" as const,
    worktreeName: null,
    branchName: null,
    checkpointId: null,
    ...overrides,
  };
}

describe("ArchiveService integration", () => {
  describe.concurrent("worktree mode", () => {
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
        expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(1);
        expect(archived.checkpointId).toBeTruthy();
        expect(ctx.foldersStore.get("taskAssociations")).toHaveLength(0);

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

        const associations = ctx.foldersStore.get("taskAssociations");
        expect(associations).toHaveLength(1);
        expect(associations[0]).toMatchObject({
          taskId: TASK_ID,
          folderId: FOLDER_ID,
          mode: "worktree",
          worktree: result.worktreeName,
        });
        expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(0);
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

        const associations = ctx.foldersStore.get("taskAssociations");
        expect(associations).toHaveLength(1);
        expect(associations[0]).toMatchObject({
          taskId: TASK_ID,
          folderId: FOLDER_ID,
          mode: "worktree",
          branchName,
        });
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
      withTestContext(
        {
          associations: [simpleAssociation("local")],
          archivedTasks: [archivedTask()],
        },
        async (ctx) => {
          const oldArchivedAt =
            ctx.archiveStore.get("archivedTasks")[0].archivedAt;

          await ctx.service.archiveTask(ctx.archiveInput());

          expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(1);
          expect(ctx.archiveStore.get("archivedTasks")[0].archivedAt).not.toBe(
            oldArchivedAt,
          );
        },
      ));

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

        ctx.foldersStore.set("taskAssociations", [
          worktreeAssociation(worktreeName),
        ]);

        const archived = await ctx.service.archiveTask(ctx.archiveInput());

        expect(archived.checkpointId).toBeTruthy();
        expect(await pathExists(legacyPath)).toBe(false);
      }));
  });

  describe.concurrent("local/cloud mode", () => {
    it.each(["local", "cloud"] as const)(
      "archive and unarchive %s mode restores correct association",
      (mode) =>
        withTestContext(
          { associations: [simpleAssociation(mode)] },
          async (ctx) => {
            await ctx.service.archiveTask(ctx.archiveInput());

            expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(1);
            expect(ctx.archiveStore.get("archivedTasks")[0].mode).toBe(mode);
            expect(
              ctx.archiveStore.get("archivedTasks")[0].checkpointId,
            ).toBeNull();
            expect(ctx.foldersStore.get("taskAssociations")).toHaveLength(0);

            const result = await ctx.service.unarchiveTask(TASK_ID);

            expect(result.worktreeName).toBeNull();
            const associations = ctx.foldersStore.get("taskAssociations");
            expect(associations).toHaveLength(1);
            expect(associations[0]).toMatchObject({
              taskId: TASK_ID,
              folderId: FOLDER_ID,
              mode,
            });
            expect(associations[0]).not.toHaveProperty("worktree");
            expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(0);
          },
        ),
    );
  });

  describe.concurrent("error handling", () => {
    it("throws when task association not found", () =>
      withTestContext({ folders: "none" }, async (ctx) => {
        await expect(
          ctx.service.archiveTask({
            taskId: "nonexistent",
          }),
        ).rejects.toThrow("No workspace association found");
      }));

    it("throws when archived task not found for unarchive", () =>
      withTestContext({}, async (ctx) => {
        await expect(ctx.service.unarchiveTask("nonexistent")).rejects.toThrow(
          "Archived task not found",
        );
      }));

    it("throws when folder not found for archive", () =>
      withTestContext(
        {
          folders: "none",
          associations: [
            { taskId: TASK_ID, folderId: "missing", mode: "local" as const },
          ],
        },
        async (ctx) => {
          await expect(
            ctx.service.archiveTask(ctx.archiveInput()),
          ).rejects.toThrow("Folder not found");
        },
      ));

    it("throws when folder not found for unarchive", () =>
      withTestContext(
        {
          folders: "none",
          archivedTasks: [archivedTask({ folderId: "missing" })],
        },
        async (ctx) => {
          await expect(ctx.service.unarchiveTask(TASK_ID)).rejects.toThrow(
            "Folder not found",
          );
        },
      ));
  });

  describe("getters", () => {
    const tasks = [archivedTask()];

    it("getArchivedTasks returns tasks from store", () =>
      withTestContext({ archivedTasks: tasks }, async (ctx) => {
        expect(ctx.service.getArchivedTasks()).toEqual(tasks);
        expect(ctx.service.getArchivedTaskIds()).toEqual([TASK_ID]);
        expect(ctx.service.isArchived(TASK_ID)).toBe(true);
        expect(ctx.service.isArchived("task-2")).toBe(false);
      }));
  });

  describe.concurrent("deleteArchivedTask", () => {
    it("deletes archived task without checkpoint", () =>
      withTestContext(
        {
          archivedTasks: [archivedTask({ mode: "local", checkpointId: null })],
        },
        async (ctx) => {
          await ctx.service.deleteArchivedTask(TASK_ID);
          expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(0);
        },
      ));

    it("deletes archived task with checkpoint", () =>
      withTestContext({}, async (ctx) => {
        const { worktreePath } = await ctx.setupWorktree("detached");
        await fs.writeFile(path.join(worktreePath, "file.txt"), "content");

        const archived = await ctx.service.archiveTask(ctx.archiveInput());
        expect(archived.checkpointId).toBeTruthy();
        expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(1);

        const refs = ctx.git("for-each-ref --format='%(refname)'");
        expect(refs).toContain(archived.checkpointId);

        await ctx.service.deleteArchivedTask(TASK_ID);

        expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(0);
        const refsAfter = ctx.git("for-each-ref --format='%(refname)'");
        expect(refsAfter).not.toContain(archived.checkpointId);
      }));

    it("throws when archived task not found", () =>
      withTestContext({}, async (ctx) => {
        await expect(
          ctx.service.deleteArchivedTask("nonexistent"),
        ).rejects.toThrow("Archived task nonexistent not found");
      }));

    it("still removes from store if checkpoint deletion fails", () =>
      withTestContext(
        {
          archivedTasks: [
            archivedTask({
              checkpointId: "worktree-nonexistent",
              mode: "worktree",
              worktreeName: "nonexistent",
            }),
          ],
        },
        async (ctx) => {
          await ctx.service.deleteArchivedTask(TASK_ID);
          expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(0);
        },
      ));

    it("still removes from store if folder not found", () =>
      withTestContext(
        {
          folders: "none",
          archivedTasks: [
            archivedTask({
              checkpointId: "worktree-test",
              folderId: "missing-folder",
            }),
          ],
        },
        async (ctx) => {
          await ctx.service.deleteArchivedTask(TASK_ID);
          expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(0);
        },
      ));
  });

  describe.concurrent("rollback behavior", () => {
    it("archive rolls back association removal if archiveStore fails", () =>
      withTestContext(
        {
          associations: [simpleAssociation("local")],
          failOnSet: { store: "archive", key: "archivedTasks" },
        },
        async (ctx) => {
          await expect(
            ctx.service.archiveTask(ctx.archiveInput()),
          ).rejects.toThrow("Injected failure");

          expect(ctx.foldersStore.get("taskAssociations")).toHaveLength(1);
          expect(ctx.foldersStore.get("taskAssociations")[0]).toEqual(
            simpleAssociation("local"),
          );
        },
      ));

    it("archive worktree rolls back checkpoint if association removal fails", () =>
      withTestContext(
        {
          failOnSet: {
            store: "folders",
            key: "taskAssociations",
            afterNCalls: 1,
          },
        },
        async (ctx) => {
          const { worktreeName } = await ctx.setupWorktree("detached");

          await expect(
            ctx.service.archiveTask(ctx.archiveInput()),
          ).rejects.toThrow("Injected failure");

          const refs = ctx.git("for-each-ref --format='%(refname)'");
          expect(refs).not.toContain(`worktree-${worktreeName}`);
        },
      ));

    it("unarchive rolls back association add if archive removal fails", () =>
      withTestContext(
        {
          archivedTasks: [archivedTask()],
          failOnSet: { store: "archive", key: "archivedTasks" },
        },
        async (ctx) => {
          await expect(ctx.service.unarchiveTask(TASK_ID)).rejects.toThrow(
            "Injected failure",
          );

          expect(ctx.foldersStore.get("taskAssociations")).toHaveLength(0);
          expect(ctx.archiveStore.get("archivedTasks")).toHaveLength(1);
        },
      ));
  });
});
