import type { Task, TaskRun } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockWorkspaceCreate = vi.hoisted(() => vi.fn());
const mockWorkspaceDelete = vi.hoisted(() => vi.fn());
const mockGetTaskDirectory = vi.hoisted(() => vi.fn());

vi.mock("@renderer/trpc", () => ({
  trpcClient: {
    workspace: {
      create: { mutate: mockWorkspaceCreate },
      delete: { mutate: mockWorkspaceDelete },
    },
  },
}));

vi.mock("@hooks/useRepositoryDirectory", () => ({
  getTaskDirectory: mockGetTaskDirectory,
}));

vi.mock("@features/provisioning/stores/provisioningStore", () => ({
  useProvisioningStore: {
    getState: () => ({
      setActive: vi.fn(),
      clear: vi.fn(),
    }),
  },
}));

vi.mock("@features/panels/store/panelLayoutStore", () => ({
  usePanelLayoutStore: {
    getState: () => ({
      addActionTab: vi.fn(),
    }),
  },
}));

vi.mock("@features/sessions/service/service", () => ({
  getSessionService: () => ({
    updateSessionTaskTitle: vi.fn(),
  }),
}));

vi.mock("@renderer/utils/generateTitle", () => ({
  generateTitleAndSummary: vi.fn(async () => null),
}));

vi.mock("@utils/queryClient", () => ({
  queryClient: {
    setQueriesData: vi.fn(),
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

import { TaskCreationSaga } from "./task-creation";

const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-123",
  task_number: 1,
  slug: "task-123",
  title: "Test task",
  description: "Ship the fix",
  origin_product: "user_created",
  repository: "posthog/posthog",
  created_at: "2026-04-03T00:00:00Z",
  updated_at: "2026-04-03T00:00:00Z",
  ...overrides,
});

const createRun = (overrides: Partial<TaskRun> = {}): TaskRun => ({
  id: "run-123",
  task: "task-123",
  team: 1,
  branch: "release/remembered-branch",
  environment: "cloud",
  status: "started",
  log_url: "https://example.com/logs/run-123",
  error_message: null,
  output: null,
  state: {},
  created_at: "2026-04-03T00:00:00Z",
  updated_at: "2026-04-03T00:00:00Z",
  completed_at: null,
  ...overrides,
});

describe("TaskCreationSaga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkspaceCreate.mockResolvedValue(undefined);
    mockWorkspaceDelete.mockResolvedValue(undefined);
    mockGetTaskDirectory.mockResolvedValue(null);
  });

  it("waits for the cloud run response before surfacing the task", async () => {
    const createdTask = createTask();
    const startedTask = createTask({ latest_run: createRun() });
    const createTaskMock = vi.fn().mockResolvedValue(createdTask);
    const runTaskInCloudMock = vi.fn().mockResolvedValue(startedTask);
    const onTaskReady = vi.fn();

    const saga = new TaskCreationSaga({
      posthogClient: {
        createTask: createTaskMock,
        deleteTask: vi.fn(),
        getTask: vi.fn(),
        runTaskInCloud: runTaskInCloudMock,
        updateTask: vi.fn(),
      } as never,
      onTaskReady,
    });

    const result = await saga.run({
      content: "Ship the fix",
      repository: "posthog/posthog",
      workspaceMode: "cloud",
      branch: "release/remembered-branch",
    });

    expect(result.success).toBe(true);
    if (!result.success) {
      throw new Error("Expected task creation to succeed");
    }

    expect(runTaskInCloudMock).toHaveBeenCalledWith(
      "task-123",
      "release/remembered-branch",
      undefined,
      undefined,
    );
    expect(onTaskReady).toHaveBeenCalledTimes(1);
    expect(onTaskReady.mock.calls[0][0].task.latest_run?.branch).toBe(
      "release/remembered-branch",
    );
    expect(result.data.task.latest_run?.branch).toBe(
      "release/remembered-branch",
    );
    expect(runTaskInCloudMock.mock.invocationCallOrder[0]).toBeLessThan(
      onTaskReady.mock.invocationCallOrder[0],
    );
  });
});
