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

const SCRATCHPAD_PATH = "/userData/scratchpads/task-123/chess-clock";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-123",
  task_number: 1,
  slug: "task-123",
  title: "Chess Clock",
  description: "A simple chess clock",
  origin_product: "user_created",
  repository: null,
  created_at: "2026-04-25T00:00:00Z",
  updated_at: "2026-04-25T00:00:00Z",
  ...overrides,
});

interface ClientFns {
  createProject?: ReturnType<typeof vi.fn>;
  deleteProject?: ReturnType<typeof vi.fn>;
  createTask?: ReturnType<typeof vi.fn>;
  deleteTask?: ReturnType<typeof vi.fn>;
}

const buildClient = (fns: ClientFns) =>
  ({
    createProject: fns.createProject ?? vi.fn(),
    deleteProject: fns.deleteProject ?? vi.fn(),
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

  it("happy path with auto-create project: completes all 5 steps and returns scratchpad output", async () => {
    const createdTask = createTask();
    const createProject = vi.fn().mockResolvedValue({ id: 42 });
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteProject = vi.fn();
    const deleteTask = vi.fn();
    const onTaskReady = vi.fn();

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createProject,
        deleteProject,
        createTask: createTaskFn,
        deleteTask,
      }),
      onTaskReady,
    });

    const result = await saga.run({
      productName: "Chess Clock",
      initialIdea: "A simple chess clock",
      rounds: 3,
      autoCreateProject: { organizationId: "org-1" },
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    // Step 1: project create
    expect(createProject).toHaveBeenCalledWith({
      name: "[UNPUBLISHED] Chess Clock",
      organizationId: "org-1",
    });

    // Step 2: task create
    expect(createTaskFn).toHaveBeenCalledWith({
      description: "A simple chess clock",
      title: "Chess Clock",
      repository: undefined,
    });

    // Step 3: scratchpad dir
    expect(mockScratchpadCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      name: "Chess Clock",
      projectId: 42,
    });

    // Step 4: workspace create
    expect(mockWorkspaceCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      mainRepoPath: SCRATCHPAD_PATH,
      folderId: SCRATCHPAD_PATH,
      folderPath: SCRATCHPAD_PATH,
      mode: "local",
      scratchpad: true,
    });

    // Step 5: agent session
    expect(mockConnectToTask).toHaveBeenCalledTimes(1);
    const connectArgs = mockConnectToTask.mock.calls[0][0];
    expect(connectArgs.task.id).toBe("task-123");
    expect(connectArgs.repoPath).toBe(SCRATCHPAD_PATH);
    expect(Array.isArray(connectArgs.initialPrompt)).toBe(true);
    expect(connectArgs.initialPrompt[0].type).toBe("text");
    expect(connectArgs.initialPrompt[0].text).toContain("Chess Clock");
    expect(connectArgs.initialPrompt[0].text).toContain("3");
    expect(connectArgs.initialPrompt[0].text).toContain(SCRATCHPAD_PATH);

    // No rollbacks
    expect(deleteProject).not.toHaveBeenCalled();
    expect(deleteTask).not.toHaveBeenCalled();
    expect(mockScratchpadDelete).not.toHaveBeenCalled();
    expect(mockWorkspaceDelete).not.toHaveBeenCalled();
    expect(mockDisconnectFromTask).not.toHaveBeenCalled();

    // Output
    expect(result.data.task.id).toBe("task-123");
    expect(result.data.workspace.scratchpad).toBe(true);
    expect(result.data.scratchpadPath).toBe(SCRATCHPAD_PATH);
    expect(result.data.projectId).toBe(42);
    expect(result.data.autoCreatedProject).toBe(true);

    // onTaskReady fired before agent_session
    expect(onTaskReady).toHaveBeenCalledTimes(1);
    expect(onTaskReady.mock.invocationCallOrder[0]).toBeLessThan(
      mockConnectToTask.mock.invocationCallOrder[0],
    );
  });

  it("failure at scratchpad_dir rolls back task and project (not scratchpad delete)", async () => {
    const createdTask = createTask();
    const createProject = vi.fn().mockResolvedValue({ id: 42 });
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteProject = vi.fn().mockResolvedValue(undefined);
    const deleteTask = vi.fn().mockResolvedValue(undefined);

    mockScratchpadCreate.mockRejectedValueOnce(new Error("disk full"));

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createProject,
        deleteProject,
        createTask: createTaskFn,
        deleteTask,
      }),
    });

    const result = await saga.run({
      productName: "Chess Clock",
      initialIdea: "A simple chess clock",
      rounds: 3,
      autoCreateProject: { organizationId: "org-1" },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.failedStep).toBe("scratchpad_dir");

    // Rollbacks fire in reverse order. scratchpad_dir didn't succeed, so its
    // rollback is NOT invoked. task and project rollbacks each fire exactly once.
    expect(mockScratchpadDelete).not.toHaveBeenCalled();
    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledWith("task-123");
    expect(deleteProject).toHaveBeenCalledTimes(1);
    expect(deleteProject).toHaveBeenCalledWith(42);

    // Workspace and agent steps never ran.
    expect(mockWorkspaceCreate).not.toHaveBeenCalled();
    expect(mockConnectToTask).not.toHaveBeenCalled();
    expect(mockWorkspaceDelete).not.toHaveBeenCalled();
    expect(mockDisconnectFromTask).not.toHaveBeenCalled();

    // task delete rollback runs before project delete rollback (reverse order)
    expect(deleteTask.mock.invocationCallOrder[0]).toBeLessThan(
      deleteProject.mock.invocationCallOrder[0],
    );
  });

  it("failure at agent_session rolls back all four prior steps in reverse order", async () => {
    const createdTask = createTask();
    const createProject = vi.fn().mockResolvedValue({ id: 42 });
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteProject = vi.fn().mockResolvedValue(undefined);
    const deleteTask = vi.fn().mockResolvedValue(undefined);

    mockConnectToTask.mockRejectedValueOnce(new Error("agent unavailable"));

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createProject,
        deleteProject,
        createTask: createTaskFn,
        deleteTask,
      }),
    });

    const result = await saga.run({
      productName: "Chess Clock",
      initialIdea: "A simple chess clock",
      rounds: 3,
      autoCreateProject: { organizationId: "org-1" },
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.failedStep).toBe("agent_session");

    // All four prior rollbacks fire in reverse order.
    expect(mockWorkspaceDelete).toHaveBeenCalledTimes(1);
    expect(mockScratchpadDelete).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledTimes(1);
    expect(deleteProject).toHaveBeenCalledTimes(1);
    // agent_session itself didn't succeed, so its rollback is NOT invoked.
    expect(mockDisconnectFromTask).not.toHaveBeenCalled();

    // Order: workspace -> scratchpad -> task -> project (reverse of creation).
    expect(mockWorkspaceDelete.mock.invocationCallOrder[0]).toBeLessThan(
      mockScratchpadDelete.mock.invocationCallOrder[0],
    );
    expect(mockScratchpadDelete.mock.invocationCallOrder[0]).toBeLessThan(
      deleteTask.mock.invocationCallOrder[0],
    );
    expect(deleteTask.mock.invocationCallOrder[0]).toBeLessThan(
      deleteProject.mock.invocationCallOrder[0],
    );
  });

  it("existing project path: skips project creation and never deletes the user-picked project", async () => {
    const createdTask = createTask();
    const createProject = vi.fn();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);
    const deleteProject = vi.fn();
    const deleteTask = vi.fn();

    // Force a failure after scratchpad_dir to ensure no project deletion happens during rollback either.
    mockWorkspaceCreate.mockRejectedValueOnce(new Error("workspace failed"));

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createProject,
        deleteProject,
        createTask: createTaskFn,
        deleteTask,
      }),
    });

    const result = await saga.run({
      productName: "Chess Clock",
      initialIdea: "A simple chess clock",
      rounds: 3,
      projectId: 999,
    });

    expect(result.success).toBe(false);
    expect(createProject).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();

    // The earlier successful steps (task, scratchpad) DID rollback.
    expect(mockScratchpadDelete).toHaveBeenCalledTimes(1);
    expect(deleteTask).toHaveBeenCalledTimes(1);

    // Scratchpad was created with the user-picked project id.
    expect(mockScratchpadCreate).toHaveBeenCalledWith({
      taskId: "task-123",
      name: "Chess Clock",
      projectId: 999,
    });
  });

  it("existing project path happy: autoCreatedProject is false and project id is preserved", async () => {
    const createdTask = createTask();
    const createProject = vi.fn();
    const createTaskFn = vi.fn().mockResolvedValue(createdTask);

    const saga = new ScratchpadCreationSaga({
      posthogClient: buildClient({
        createProject,
        createTask: createTaskFn,
      }),
    });

    const result = await saga.run({
      productName: "Chess Clock",
      initialIdea: "A simple chess clock",
      rounds: 3,
      projectId: 999,
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(createProject).not.toHaveBeenCalled();
    expect(result.data.autoCreatedProject).toBe(false);
    expect(result.data.projectId).toBe(999);
  });
});
