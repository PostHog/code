import type { Task } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockScratchpadCreate = vi.hoisted(() => vi.fn());
const mockScratchpadDelete = vi.hoisted(() => vi.fn());
const mockWorkspaceCreate = vi.hoisted(() => vi.fn());
const mockWorkspaceDelete = vi.hoisted(() => vi.fn());
const mockConnectToTask = vi.hoisted(() => vi.fn());
const mockDisconnectFromTask = vi.hoisted(() => vi.fn());

vi.mock("@renderer/trpc", () => ({
  trpcClient: {
    scratchpad: {
      create: { mutate: mockScratchpadCreate },
      delete: { mutate: mockScratchpadDelete },
    },
    workspace: {
      create: { mutate: mockWorkspaceCreate },
      delete: { mutate: mockWorkspaceDelete },
    },
  },
}));

vi.mock("@features/sessions/service/service", () => ({
  getSessionService: () => ({
    connectToTask: mockConnectToTask,
    disconnectFromTask: mockDisconnectFromTask,
  }),
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
    mockWorkspaceCreate.mockResolvedValue({
      taskId: "task-123",
      mode: "local",
      worktree: null,
      branchName: null,
      linkedBranch: null,
    });
    mockWorkspaceDelete.mockResolvedValue(undefined);
    mockConnectToTask.mockResolvedValue(undefined);
    mockDisconnectFromTask.mockResolvedValue(undefined);
  });

  it("happy path with no linked project: manifest projectId is null, all 4 steps run", async () => {
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

    // task create
    expect(createTaskFn).toHaveBeenCalledWith({
      description: "On-demand dog walks",
      title: "Uber for dogs",
      repository: undefined,
    });

    // scratchpad dir — projectId is null
    expect(mockScratchpadCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      name: "Uber for dogs",
      projectId: null,
    });

    // workspace create
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      mainRepoPath: SCRATCHPAD_PATH,
      folderId: SCRATCHPAD_PATH,
      folderPath: SCRATCHPAD_PATH,
      mode: "local",
      scratchpad: true,
    });

    // agent session
    expect(mockConnectToTask).toHaveBeenCalledTimes(1);
    const connectArgs = mockConnectToTask.mock.calls[0][0];
    expect(connectArgs.task.id).toBe("task-123");
    expect(connectArgs.repoPath).toBe(SCRATCHPAD_PATH);
    expect(Array.isArray(connectArgs.initialPrompt)).toBe(true);
    expect(connectArgs.initialPrompt[0].type).toBe("text");
    expect(connectArgs.initialPrompt[0].text).toContain("Uber for dogs");

    // No rollbacks
    expect(deleteTask).not.toHaveBeenCalled();
    expect(mockScratchpadDelete).not.toHaveBeenCalled();
    expect(mockWorkspaceDelete).not.toHaveBeenCalled();
    expect(mockDisconnectFromTask).not.toHaveBeenCalled();

    // Output
    expect(result.data.task.id).toBe("task-123");
    expect(result.data.workspace.scratchpad).toBe(true);
    expect(result.data.scratchpadPath).toBe(SCRATCHPAD_PATH);
    expect(result.data.projectId).toBe(null);

    // onTaskReady fired before agent_session
    expect(onTaskReady).toHaveBeenCalledTimes(1);
    expect(onTaskReady.mock.invocationCallOrder[0]).toBeLessThan(
      mockConnectToTask.mock.invocationCallOrder[0],
    );
  });

  it("existing project: passes projectId through to manifest and never creates a project", async () => {
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

  it("failure at scratchpad_dir rolls back task only (no project to delete)", async () => {
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

    // task rollback fires; scratchpad_dir didn't succeed so its rollback doesn't.
    expect(mockScratchpadDelete).not.toHaveBeenCalled();
    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith("task-123");

    // Workspace and agent steps never ran.
    expect(mockWorkspaceCreate).not.toHaveBeenCalled();
    expect(mockConnectToTask).not.toHaveBeenCalled();
  });

  it("failure at agent_session rolls back all three prior steps in reverse order", async () => {
    const createdTask = createTask();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteTask = vi.fn().mockResolvedValue(undefined);

    mockConnectToTask.mockRejectedValueOnce(new Error("agent unavailable"));

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
    expect(result.failedStep).toBe("agent_session");

    // All three prior rollbacks fire in reverse order.
    expect(mockWorkspaceDelete).toHaveBeenCalledTimes(1);
    expect(mockScratchpadDelete).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledTimes(1);
    // agent_session itself didn't succeed, so its rollback is NOT invoked.
    expect(mockDisconnectFromTask).not.toHaveBeenCalled();

    // Order: workspace -> scratchpad -> task (reverse of creation).
    expect(mockWorkspaceDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockScratchpadDelete.mock.invocationCallOrder[0],
    );
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
