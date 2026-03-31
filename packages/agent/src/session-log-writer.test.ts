import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogAPIClient } from "./posthog-api";
import { SessionLogWriter } from "./session-log-writer";
import type { StoredNotification } from "./types";

function makeSessionUpdate(
  sessionUpdate: string,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    method: "session/update",
    params: { update: { sessionUpdate, ...extra } },
  });
}

describe("SessionLogWriter", () => {
  let logWriter: SessionLogWriter;
  let mockAppendLog: ReturnType<typeof vi.fn>;
  let mockPosthogAPI: PostHogAPIClient;

  beforeEach(() => {
    mockAppendLog = vi.fn().mockResolvedValue(undefined);
    mockPosthogAPI = {
      appendTaskRunLog: mockAppendLog,
    } as unknown as PostHogAPIClient;

    logWriter = new SessionLogWriter({ posthogAPI: mockPosthogAPI });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("appendRawLine", () => {
    it("queues entries for flush", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));
      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test2" }));

      await logWriter.flush(sessionId);

      expect(mockAppendLog).toHaveBeenCalledTimes(1);
      const entries: StoredNotification[] = mockAppendLog.mock.calls[0][2];
      expect(entries).toHaveLength(2);
    });

    it("ignores unregistered sessions", async () => {
      logWriter.appendRawLine("unknown", JSON.stringify({ method: "test" }));
      await logWriter.flush("unknown");
      expect(mockAppendLog).not.toHaveBeenCalled();
    });

    it("ignores invalid JSON", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(sessionId, "not valid json {{{");
      await logWriter.flush(sessionId);
      expect(mockAppendLog).not.toHaveBeenCalled();
    });

    it("re-queues entries when persistence fails and retries", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      mockAppendLog
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce(undefined);

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));

      await logWriter.flush(sessionId);
      await logWriter.flush(sessionId);

      expect(mockAppendLog).toHaveBeenCalledTimes(2);
      const retriedEntries: StoredNotification[] =
        mockAppendLog.mock.calls[1][2];
      expect(retriedEntries).toHaveLength(1);
      expect(retriedEntries[0].notification.method).toBe("test");
    });

    it("drops entries after max retries", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      mockAppendLog.mockRejectedValue(new Error("persistent failure"));

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "test" }));

      // Flush 10 times (MAX_FLUSH_RETRIES) — entries should be dropped on the 10th
      for (let i = 0; i < 10; i++) {
        await logWriter.flush(sessionId);
      }

      expect(mockAppendLog).toHaveBeenCalledTimes(10);

      // After max retries the entries are dropped, so an 11th flush has nothing
      mockAppendLog.mockClear();
      await logWriter.flush(sessionId);
      expect(mockAppendLog).not.toHaveBeenCalled();
    });
  });

  describe("agent_message_chunk coalescing", () => {
    it("coalesces consecutive chunks into a single agent_message", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("agent_message_chunk", {
          content: { type: "text", text: "Hello " },
        }),
      );
      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("agent_message_chunk", {
          content: { type: "text", text: "world" },
        }),
      );
      // Non-chunk event triggers flush of chunks
      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("tool_call", { toolCallId: "tc1" }),
      );

      await logWriter.flush(sessionId);

      const entries: StoredNotification[] = mockAppendLog.mock.calls[0][2];
      expect(entries).toHaveLength(2); // coalesced message + tool_call

      const coalesced = entries[0].notification;
      expect(coalesced.params?.update).toEqual({
        sessionUpdate: "agent_message",
        content: { type: "text", text: "Hello world" },
      });
      expect(logWriter.getLastAgentMessage(sessionId)).toBe("Hello world");
    });

    it("tracks direct agent_message updates", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      logWriter.appendRawLine(
        sessionId,
        makeSessionUpdate("agent_message", {
          content: { type: "text", text: "Pick MIT or Apache" },
        }),
      );

      await logWriter.flush(sessionId);

      expect(logWriter.getLastAgentMessage(sessionId)).toBe(
        "Pick MIT or Apache",
      );
    });
  });

  describe("register", () => {
    it("does not re-register existing sessions", () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });
      logWriter.register(sessionId, { taskId: "t2", runId: sessionId });

      expect(logWriter.isRegistered(sessionId)).toBe(true);
    });
  });

  describe("flush serialization", () => {
    it("serializes concurrent flush calls so they do not overlap", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      const callOrder: string[] = [];
      let resolveFirst!: () => void;
      const firstBlocked = new Promise<void>((r) => {
        resolveFirst = r;
      });

      mockAppendLog
        .mockImplementationOnce(async () => {
          callOrder.push("first-start");
          // Add a new entry while the first flush is in-flight
          logWriter.appendRawLine(sessionId, JSON.stringify({ method: "b" }));
          await firstBlocked;
          callOrder.push("first-end");
        })
        .mockImplementationOnce(async () => {
          callOrder.push("second-start");
        });

      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "a" }));
      const flush1 = logWriter.flush(sessionId);

      // Wait for the first flush to be in-flight — "b" is added inside the mock
      await vi.waitFor(() => expect(callOrder).toContain("first-start"));

      // Queue a second flush for the entry added while first was in-flight
      const flush2 = logWriter.flush(sessionId);

      // First flush is blocked — second should not have started
      expect(callOrder).not.toContain("second-start");

      // Unblock first flush
      resolveFirst?.();
      await flush1;
      await flush2;

      // Second started only after first completed
      expect(callOrder).toEqual(["first-start", "first-end", "second-start"]);
    });

    it("does not lose entries when flushes are serialized", async () => {
      const sessionId = "s1";
      logWriter.register(sessionId, { taskId: "t1", runId: sessionId });

      let resolveFirst!: () => void;
      const firstBlocked = new Promise<void>((r) => {
        resolveFirst = r;
      });

      mockAppendLog
        .mockImplementationOnce(async () => {
          // Add a new entry while the first flush is in-flight — simulates
          // the agent emitting end_turn while a scheduled flush is sending
          // earlier entries to S3.
          logWriter.appendRawLine(sessionId, JSON.stringify({ method: "b" }));
          await firstBlocked;
        })
        .mockImplementationOnce(async () => undefined);

      // Batch 1
      logWriter.appendRawLine(sessionId, JSON.stringify({ method: "a" }));
      const flush1 = logWriter.flush(sessionId);

      // Wait for first flush to be in-flight (and "b" to be added)
      await vi.waitFor(() => expect(mockAppendLog).toHaveBeenCalledTimes(1));

      // Queue flush for the entry added while first was in-flight
      const flush2 = logWriter.flush(sessionId);

      resolveFirst?.();
      await flush1;
      await flush2;

      expect(mockAppendLog).toHaveBeenCalledTimes(2);
      const batch1: StoredNotification[] = mockAppendLog.mock.calls[0][2];
      const batch2: StoredNotification[] = mockAppendLog.mock.calls[1][2];
      expect(batch1).toHaveLength(1);
      expect(batch1[0].notification.method).toBe("a");
      expect(batch2).toHaveLength(1);
      expect(batch2[0].notification.method).toBe("b");
    });
  });
});
