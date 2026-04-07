import type { TreeSnapshotEvent } from "@posthog/agent/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HandoffSagaDeps, HandoffSagaInput } from "./handoff-saga";
import { HandoffSaga } from "./handoff-saga";

const mockResumeFromLog = vi.hoisted(() => vi.fn());
const mockFormatConversation = vi.hoisted(() => vi.fn());

vi.mock("@posthog/agent/resume", () => ({
  resumeFromLog: mockResumeFromLog,
  formatConversationForResume: mockFormatConversation,
}));

function createInput(
  overrides: Partial<HandoffSagaInput> = {},
): HandoffSagaInput {
  return {
    taskId: "task-1",
    runId: "run-1",
    repoPath: "/repo",
    apiHost: "https://us.posthog.com",
    teamId: 2,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<TreeSnapshotEvent> = {},
): TreeSnapshotEvent {
  return {
    treeHash: "abc123",
    baseCommit: "def456",
    archiveUrl: "https://s3.example.com/archive.tar.gz",
    changes: [{ path: "test.txt", status: "A" }],
    timestamp: "2026-04-07T00:00:00Z",
    ...overrides,
  };
}

function createDeps(overrides: Partial<HandoffSagaDeps> = {}): HandoffSagaDeps {
  return {
    createApiClient: vi.fn().mockReturnValue({
      getTaskRun: vi.fn().mockResolvedValue({
        log_url: "https://logs.example.com/run-1.ndjson",
      }),
    }),
    applyTreeSnapshot: vi.fn().mockResolvedValue(undefined),
    updateWorkspaceMode: vi.fn(),
    reconnectSession: vi.fn().mockResolvedValue({
      sessionId: "session-1",
      channel: "ch-1",
    }),
    closeCloudRun: vi.fn().mockResolvedValue(undefined),
    seedLocalLogs: vi.fn().mockResolvedValue(undefined),
    killSession: vi.fn().mockResolvedValue(undefined),
    setPendingContext: vi.fn(),
    onProgress: vi.fn(),
    ...overrides,
  };
}

describe("HandoffSaga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFormatConversation.mockReturnValue("conversation summary");
  });

  it("completes happy path with snapshot", async () => {
    const snapshot = createSnapshot();
    mockResumeFromLog.mockResolvedValue({
      conversation: [
        { role: "user", content: [{ type: "text", text: "hello" }] },
      ],
      latestSnapshot: snapshot,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 10,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    const result = await saga.run(createInput());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sessionId).toBe("session-1");
    expect(result.data.snapshotApplied).toBe(true);
    expect(result.data.conversationTurns).toBe(1);
  });

  it("closes cloud run before fetching logs", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    await saga.run(createInput());

    expect(deps.closeCloudRun).toHaveBeenCalledWith(
      "task-1",
      "run-1",
      "https://us.posthog.com",
      2,
    );
    const closeOrder = (deps.closeCloudRun as ReturnType<typeof vi.fn>).mock
      .invocationCallOrder[0];
    const fetchOrder = mockResumeFromLog.mock.invocationCallOrder[0];
    expect(closeOrder).toBeLessThan(fetchOrder);
  });

  it("skips snapshot apply when no archiveUrl", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: createSnapshot({ archiveUrl: undefined }),
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 5,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    const result = await saga.run(createInput());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.snapshotApplied).toBe(false);
    expect(deps.applyTreeSnapshot).not.toHaveBeenCalled();
  });

  it("skips snapshot apply when no snapshot at all", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    const result = await saga.run(createInput());

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.snapshotApplied).toBe(false);
    expect(deps.applyTreeSnapshot).not.toHaveBeenCalled();
  });

  it("seeds local logs when cloudLogUrl is present", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    await saga.run(createInput());

    expect(deps.seedLocalLogs).toHaveBeenCalledWith(
      "run-1",
      "https://logs.example.com/run-1.ndjson",
    );
  });

  it("skips seeding logs when cloudLogUrl is falsy", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const apiClient = {
      getTaskRun: vi.fn().mockResolvedValue({ log_url: undefined }),
    };
    const deps = createDeps({
      createApiClient: vi.fn().mockReturnValue(apiClient),
    });
    const saga = new HandoffSaga(deps);
    await saga.run(createInput());

    expect(deps.seedLocalLogs).not.toHaveBeenCalled();
  });

  it("sets pending context with handoff summary", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [
        { role: "user", content: [{ type: "text", text: "hello" }] },
      ],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 1,
    });
    mockFormatConversation.mockReturnValue("User said hello");

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    await saga.run(createInput());

    expect(deps.setPendingContext).toHaveBeenCalledWith(
      "run-1",
      expect.stringContaining("resuming a previous conversation"),
    );
    expect(deps.setPendingContext).toHaveBeenCalledWith(
      "run-1",
      expect.stringContaining("could not be restored"),
    );
  });

  it("context mentions files restored when snapshot applied", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: createSnapshot(),
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    await saga.run(createInput());

    expect(deps.setPendingContext).toHaveBeenCalledWith(
      "run-1",
      expect.stringContaining("fully restored"),
    );
  });

  it("passes sessionId and adapter through to reconnectSession", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: null,
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    await saga.run(createInput({ sessionId: "ses-abc", adapter: "codex" }));

    expect(deps.reconnectSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "ses-abc",
        adapter: "codex",
      }),
    );
  });

  it("emits progress events in order", async () => {
    mockResumeFromLog.mockResolvedValue({
      conversation: [],
      latestSnapshot: createSnapshot(),
      snapshotApplied: false,
      interrupted: false,
      logEntryCount: 0,
    });

    const deps = createDeps();
    const saga = new HandoffSaga(deps);
    await saga.run(createInput());

    const progressCalls = (deps.onProgress as ReturnType<typeof vi.fn>).mock
      .calls;
    const steps = progressCalls.map((call: unknown[]) => call[0]);
    expect(steps).toEqual([
      "fetching_logs",
      "applying_snapshot",
      "spawning_agent",
      "complete",
    ]);
  });

  describe("rollbacks", () => {
    it("rolls back workspace mode when spawn_agent fails", async () => {
      mockResumeFromLog.mockResolvedValue({
        conversation: [],
        latestSnapshot: null,
        snapshotApplied: false,
        interrupted: false,
        logEntryCount: 0,
      });

      const deps = createDeps({
        reconnectSession: vi.fn().mockRejectedValue(new Error("spawn failed")),
      });
      const saga = new HandoffSaga(deps);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failedStep).toBe("spawn_agent");
      expect(deps.updateWorkspaceMode).toHaveBeenCalledWith("task-1", "cloud");
    });

    it("kills session on rollback if spawn partially succeeded", async () => {
      mockResumeFromLog.mockResolvedValue({
        conversation: [],
        latestSnapshot: null,
        snapshotApplied: false,
        interrupted: false,
        logEntryCount: 0,
      });

      const deps = createDeps({
        reconnectSession: vi.fn().mockResolvedValue(null),
      });
      const saga = new HandoffSaga(deps);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failedStep).toBe("spawn_agent");
    });

    it("fails at fetch_and_rebuild without rolling back workspace", async () => {
      mockResumeFromLog.mockRejectedValue(new Error("API down"));

      const deps = createDeps();
      const saga = new HandoffSaga(deps);
      const result = await saga.run(createInput());

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.failedStep).toBe("fetch_and_rebuild");
      expect(deps.updateWorkspaceMode).not.toHaveBeenCalled();
      expect(deps.reconnectSession).not.toHaveBeenCalled();
    });
  });
});
