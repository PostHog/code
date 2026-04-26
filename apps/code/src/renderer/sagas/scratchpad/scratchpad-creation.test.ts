import type { Task } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockScratchpadCreate = vi.hoisted(() => vi.fn());
const mockScratchpadDelete = vi.hoisted(() => vi.fn());
const mockAddFolder = vi.hoisted(() => vi.fn());
const mockWorkspaceCreate = vi.hoisted(() => vi.fn());
const mockWorkspaceDelete = vi.hoisted(() => vi.fn());

vi.mock("@renderer/trpc", () => ({
  trpcClient: {
    scratchpad: {
      create: { mutate: mockScratchpadCreate },
      delete: { mutate: mockScratchpadDelete },
    },
    folders: {
      addFolder: { mutate: mockAddFolder },
    },
    workspace: {
      create: { mutate: mockWorkspaceCreate },
      delete: { mutate: mockWorkspaceDelete },
    },
  },
}));

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { ScratchpadCreationSaga } from "./scratchpad-creation";

const SCRATCHPAD_PATH = "/userData/scratchpads/task-123/uber-for-dogs";
const FOLDER_ID = "folder-uuid-1";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-123",
  task_number: 1,
  slug: "task-123",
  title: "Uber for dogs",
  description: "On-demand dog walks",
  origin_product: "user_created",
  repository: null,
  created_at: "2026-04-25T00:00:00Z",
  updated_at: "2026-04-25T00:00:00Z",
  ...overrides,
});

interface ClientFns {
  createTask?: ReturnType<typeof vi.fn>;
  deleteTask?: ReturnType<typeof vi.fn>;
}

const buildClient = (fns: ClientFns) =>
  ({
    createTask: fns.createTask ?? vi.fn(),
    deleteTask: fns.deleteTask ?? vi.fn(),
  }) as never;

describe("ScratchpadCreationSaga", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockScratchpadCreate.mockResolvedValue({ scratchpadPath: SCRATCHPAD_PATH });
    mockScratchpadDelete.mockResolvedValue({ success: true });
    mockAddFolder.mockResolvedValue({
      id: FOLDER_ID,
      path: SCRATCHPAD_PATH,
      exists: true,
    });
    mockWorkspaceCreate.mockResolvedValue({
      taskId: "task-123",
      mode: "local",
      worktree: null,
      branchName: null,
      linkedBranch: null,
    });
    mockWorkspaceDelete.mockResolvedValue(undefined);
  });

  it("happy path with no linked project: manifest projectId is null, returns initialPrompt", async () => {
    const createdTask = createTask();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteTask = vi.fn();
    const onTaskReady = vi.fn();

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createTask: createTaskFn,
        deleteTask,
      }),
      onTaskReady,
    });

    const result = await saga.run({
      productName: "Uber for dogs",
      initialIdea: "On-demand dog walks",
      rounds: 3,
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(createTaskFn).toHaveBeenCalledWith({
      description: "On-demand dog walks",
      title: "Building Uber for dogs",
      repository: undefined,
    });

    // scratchpad dir
    expect(mockScratchpadCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      name: "Uber for dogs",
      projectId: null,
    });

    // folder registered
    expect(mockAddFolder).toHaveBeenCalledWith({ folderPath: SCRATCHPAD_PATH });

    // workspace uses the registered folder id (NOT the path)
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      mainRepoPath: SCRATCHPAD_PATH,
      folderId: FOLDER_ID,
      folderPath: SCRATCHPAD_PATH,
      mode: "local",
      scratchpad: true,
    });

    // No rollbacks
    expect(deleteTask).not.toHaveBeenCalled();
    expect(mockScratchpadDelete).not.toHaveBeenCalled();
    expect(mockWorkspaceDelete).not.toHaveBeenCalled();

    // Output
    expect(result.data.task.id).toBe("task-123");
    expect(result.data.workspace.scratchpad).toBe(true);
    expect(result.data.workspace.folderId).toBe(FOLDER_ID);
    expect(result.data.scratchpadPath).toBe(SCRATCHPAD_PATH);
    expect(result.data.projectId).toBe(null);
    expect(Array.isArray(result.data.initialPrompt)).toBe(true);
    expect(result.data.initialPrompt[0]?.type).toBe("text");
    expect((result.data.initialPrompt[0] as { text: string }).text).toContain(
      "Uber for dogs",
    );

    // onTaskReady fired before saga returned (last meaningful call before
    // returning to caller)
    expect(onTaskReady).toHaveBeenCalledTimes(1);
  });

  it("existing project: passes projectId through to manifest", async () => {
    const createdTask = createTask();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createTask: createTaskFn,
      }),
    });

    const result = await saga.run({
      productName: "Uber for dogs",
      initialIdea: "On-demand dog walks",
      rounds: 3,
      projectId: 999,
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.projectId).toBe(999);

    expect(mockScratchpadCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      name: "Uber for dogs",
      projectId: 999,
    });
  });

  it("failure at scratchpad_dir rolls back task only", async () => {
    const createdTask = createTask();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteTask = vi.fn().mockResolvedValue(undefined);

    mockScratchpadCreate.mockRejectedValueOnce(new Error("disk full"));

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createTask: createTaskFn,
        deleteTask,
      }),
    });

    const result = await saga.run({
      productName: "Uber for dogs",
      initialIdea: "On-demand dog walks",
      rounds: 3,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.failedStep).toBe("scratchpad_dir");

    expect(mockScratchpadDelete).not.toHaveBeenCalled();
    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith("task-123");

    // Folder + workspace steps never ran.
    expect(mockAddFolder).not.toHaveBeenCalled();
    expect(mockWorkspaceCreate).not.toHaveBeenCalled();
  });

  it("failure at workspace_creation rolls back scratchpad + task in reverse order", async () => {
    const createdTask = createTask();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteTask = vi.fn().mockResolvedValue(undefined);

    mockWorkspaceCreate.mockRejectedValueOnce(new Error("workspace failed"));

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createTask: createTaskFn,
        deleteTask,
      }),
    });

    const result = await saga.run({
      productName: "Uber for dogs",
      initialIdea: "On-demand dog walks",
      rounds: 3,
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.failedStep).toBe("workspace_creation");

    expect(mockScratchpadDelete).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledTimes(1);

    // Order: scratchpad -> task (reverse of creation).
    expect(mockScratchpadDelete.mock.invocationCallOrder[0]).toBeLessThan(
      deleteTask.mock.invocationCallOrder[0],
    );
  });

  it("user-picked existing project is never deleted on rollback", async () => {
    const createdTask = createTask();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteTask = vi.fn();
    const deleteProject = vi.fn();

    mockWorkspaceCreate.mockRejectedValueOnce(new Error("workspace failed"));

    const saga = new ScratchpadCreationSaga({
      posthogClient: {
        createTask: createTaskFn,
        deleteTask,
        deleteProject,
      } as never,
    });

    const result = await saga.run({
      productName: "Uber for dogs",
      initialIdea: "On-demand dog walks",
      rounds: 3,
      projectId: 999,
    });

    expect(result.success).toBe(false);
    expect(deleteProject).not.toHaveBeenCalled();
    expect(mockScratchpadDelete).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledTimes(1);
  });
});
