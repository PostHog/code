import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudTaskEvent } from "./schemas";

const mockNetFetch = vi.hoisted(() => vi.fn());
const mockStreamFetch = vi.hoisted(() => vi.fn());

// The service now uses global fetch for BOTH authenticated API calls (JSON)
// and SSE streaming. The two used to be distinct (net.fetch vs global fetch).
// To preserve the existing test fixtures, route by URL: /stream/ → stream mock,
// everything else → API mock.
const fetchRouter = vi.hoisted(() =>
  vi.fn((input: string | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const impl = url.includes("/stream/") ? mockStreamFetch : mockNetFetch;
    return impl(input, init);
  }),
);

vi.mock("../../utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { CloudTaskService } from "./service";

const mockAuthService = {
  authenticatedFetch: vi.fn(),
};

function createJsonResponse(
  data: unknown,
  status = 200,
  headers?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...(headers ?? {}) },
  });
}

function createSseResponse(payload: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

function createOpenSseResponse(payload: string, status = 200): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
    },
  });

  return new Response(stream, {
    status,
    headers: { "Content-Type": "text/event-stream" },
  });
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2_000,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(10);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

describe("CloudTaskService", () => {
  let service: CloudTaskService;

  beforeEach(() => {
    service = new CloudTaskService(mockAuthService as never);
    mockNetFetch.mockReset();
    mockStreamFetch.mockReset();
    mockAuthService.authenticatedFetch.mockReset();
    vi.stubGlobal("fetch", fetchRouter);

    mockAuthService.authenticatedFetch.mockImplementation(
      async (
        fetchImpl: typeof fetch,
        input: string | Request,
        init?: RequestInit,
      ) => {
        return fetchImpl(input, {
          ...init,
          headers: {
            ...(init?.headers ?? {}),
            Authorization: "Bearer token",
          },
        });
      },
    );
  });

  afterEach(() => {
    service.unwatchAll();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("bootstraps paged backlog for active runs and drains deduped live SSE entries", async () => {
    const updates: unknown[] = [];
    service.on(CloudTaskEvent.Update, (payload) => updates.push(payload));

    mockNetFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "run-1",
          status: "in_progress",
          stage: "build",
          output: null,
          error_message: null,
          branch: "main",
          updated_at: "2026-01-01T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          [
            {
              type: "notification",
              timestamp: "2026-01-01T00:00:00Z",
              notification: {
                jsonrpc: "2.0",
                method: "_posthog/console",
                params: {
                  sessionId: "run-1",
                  level: "info",
                  message: "older history",
                },
              },
            },
          ],
          200,
          { "X-Has-More": "true" },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          [
            {
              type: "notification",
              timestamp: "2026-01-01T00:00:01Z",
              notification: {
                jsonrpc: "2.0",
                method: "_posthog/console",
                params: {
                  sessionId: "run-1",
                  level: "info",
                  message: "hello",
                },
              },
            },
          ],
          200,
          { "X-Has-More": "false" },
        ),
      );

    mockStreamFetch.mockResolvedValueOnce(
      createOpenSseResponse(
        'id: 1\ndata: {"type":"notification","timestamp":"2026-01-01T00:00:01Z","notification":{"jsonrpc":"2.0","method":"_posthog/console","params":{"sessionId":"run-1","level":"info","message":"hello"}}}\n\nid: 2\ndata: {"type":"notification","timestamp":"2026-01-01T00:00:02Z","notification":{"jsonrpc":"2.0","method":"_posthog/console","params":{"sessionId":"run-1","level":"info","message":"live tail"}}}\n\n',
      ),
    );

    service.watch({
      taskId: "task-1",
      runId: "run-1",
      apiHost: "https://app.example.com",
      teamId: 2,
    });

    await waitFor(() => updates.length >= 2);

    expect(updates).toEqual([
      {
        taskId: "task-1",
        runId: "run-1",
        kind: "snapshot",
        newEntries: [
          {
            type: "notification",
            timestamp: "2026-01-01T00:00:00Z",
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/console",
              params: {
                sessionId: "run-1",
                level: "info",
                message: "older history",
              },
            },
          },
          {
            type: "notification",
            timestamp: "2026-01-01T00:00:01Z",
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/console",
              params: {
                sessionId: "run-1",
                level: "info",
                message: "hello",
              },
            },
          },
        ],
        totalEntryCount: 2,
        status: "in_progress",
        stage: "build",
        output: null,
        errorMessage: null,
        branch: "main",
      },
      {
        taskId: "task-1",
        runId: "run-1",
        kind: "logs",
        newEntries: [
          {
            type: "notification",
            timestamp: "2026-01-01T00:00:02Z",
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/console",
              params: {
                sessionId: "run-1",
                level: "info",
                message: "live tail",
              },
            },
          },
        ],
        totalEntryCount: 3,
      },
    ]);

    expect(mockStreamFetch).toHaveBeenCalledWith(
      "https://app.example.com/api/projects/2/tasks/task-1/runs/run-1/stream/?start=latest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          Accept: "text/event-stream",
        }),
      }),
    );
  });

  it("reconnects with Last-Event-ID after a stream error", async () => {
    vi.useFakeTimers();

    const updates: unknown[] = [];
    service.on(CloudTaskEvent.Update, (payload) => updates.push(payload));

    mockNetFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "run-1",
          status: "in_progress",
          stage: null,
          output: null,
          error_message: null,
          branch: "main",
          updated_at: "2026-01-01T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse([], 200, { "X-Has-More": "false" }),
      );

    mockStreamFetch
      .mockResolvedValueOnce(
        createSseResponse(
          'id: 1\ndata: {"type":"notification","timestamp":"2026-01-01T00:00:01Z","notification":{"jsonrpc":"2.0","method":"_posthog/console","params":{"sessionId":"run-1","level":"info","message":"hello"}}}\n\nevent: error\ndata: {"error":"boom"}\n\n',
        ),
      )
      .mockResolvedValueOnce(
        createOpenSseResponse(
          'id: 2\ndata: {"type":"notification","timestamp":"2026-01-01T00:00:02Z","notification":{"jsonrpc":"2.0","method":"_posthog/console","params":{"sessionId":"run-1","level":"info","message":"again"}}}\n\n',
        ),
      );

    service.watch({
      taskId: "task-1",
      runId: "run-1",
      apiHost: "https://app.example.com",
      teamId: 2,
    });

    await vi.advanceTimersByTimeAsync(2_000);
    await waitFor(() => updates.length >= 2);

    expect(mockStreamFetch).toHaveBeenNthCalledWith(
      2,
      "https://app.example.com/api/projects/2/tasks/task-1/runs/run-1/stream/",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
          Accept: "text/event-stream",
          "Last-Event-ID": "1",
        }),
      }),
    );
  });

  it("ignores keepalive SSE events while keeping the stream open", async () => {
    const updates: unknown[] = [];
    service.on(CloudTaskEvent.Update, (payload) => updates.push(payload));

    mockNetFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "run-1",
          status: "in_progress",
          stage: "build",
          output: null,
          error_message: null,
          branch: "main",
          updated_at: "2026-01-01T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse([], 200, { "X-Has-More": "false" }),
      );

    mockStreamFetch.mockResolvedValueOnce(
      createOpenSseResponse(
        'event: keepalive\ndata: {"type":"keepalive"}\n\nid: 2\ndata: {"type":"notification","timestamp":"2026-01-01T00:00:02Z","notification":{"jsonrpc":"2.0","method":"_posthog/console","params":{"sessionId":"run-1","level":"info","message":"live tail"}}}\n\n',
      ),
    );

    service.watch({
      taskId: "task-1",
      runId: "run-1",
      apiHost: "https://app.example.com",
      teamId: 2,
    });

    await waitFor(() => updates.length >= 2);

    expect(updates).toEqual([
      {
        taskId: "task-1",
        runId: "run-1",
        kind: "snapshot",
        newEntries: [],
        totalEntryCount: 0,
        status: "in_progress",
        stage: "build",
        output: null,
        errorMessage: null,
        branch: "main",
      },
      {
        taskId: "task-1",
        runId: "run-1",
        kind: "logs",
        newEntries: [
          {
            type: "notification",
            timestamp: "2026-01-01T00:00:02Z",
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/console",
              params: {
                sessionId: "run-1",
                level: "info",
                message: "live tail",
              },
            },
          },
        ],
        totalEntryCount: 1,
      },
    ]);
  });

  it("emits a retryable cloud error after repeated stream failures", async () => {
    vi.useFakeTimers();

    const updates: unknown[] = [];
    service.on(CloudTaskEvent.Update, (payload) => updates.push(payload));

    const makeInProgressRun = () =>
      createJsonResponse({
        id: "run-1",
        status: "in_progress",
        stage: null,
        output: null,
        error_message: null,
        branch: "main",
        updated_at: "2026-01-01T00:00:00Z",
      });

    mockNetFetch
      .mockResolvedValueOnce(makeInProgressRun()) // bootstrap: fetchTaskRun
      .mockResolvedValueOnce(
        createJsonResponse([], 200, { "X-Has-More": "false" }),
      ) // bootstrap: fetchSessionLogs
      // Each stream error triggers handleStreamCompletion → fetchTaskRun
      .mockImplementation(() => Promise.resolve(makeInProgressRun()));

    mockStreamFetch.mockImplementation(() =>
      Promise.resolve(
        createSseResponse('event: error\ndata: {"error":"boom"}\n\n'),
      ),
    );

    service.watch({
      taskId: "task-1",
      runId: "run-1",
      apiHost: "https://app.example.com",
      teamId: 2,
    });

    await waitFor(() => mockStreamFetch.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(70_000);
    await waitFor(
      () =>
        updates.some(
          (u) =>
            typeof u === "object" &&
            u !== null &&
            (u as { kind?: string }).kind === "error",
        ),
      10_000,
    );

    expect(mockStreamFetch.mock.calls.length).toBe(6);
    // 2 bootstrap calls + 6 handleStreamCompletion calls (one per stream error)
    expect(mockNetFetch).toHaveBeenCalledTimes(8);
    expect(updates).toContainEqual({
      taskId: "task-1",
      runId: "run-1",
      kind: "error",
      errorTitle: "Cloud stream disconnected",
      errorMessage:
        "Lost connection to the cloud run stream. Retry to reconnect.",
      retryable: true,
    });
  });

  it("loads paginated persisted logs once for an already terminal run", async () => {
    const updates: unknown[] = [];
    service.on(CloudTaskEvent.Update, (payload) => updates.push(payload));

    mockNetFetch
      .mockResolvedValueOnce(
        createJsonResponse({
          id: "run-1",
          status: "completed",
          stage: "build",
          output: null,
          error_message: null,
          branch: "main",
          updated_at: "2026-01-01T00:00:00Z",
          completed_at: "2026-01-01T00:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          [
            {
              type: "notification",
              timestamp: "2026-01-01T00:00:01Z",
              notification: {
                jsonrpc: "2.0",
                method: "_posthog/console",
                params: {
                  sessionId: "run-1",
                  level: "info",
                  message: "done-1",
                },
              },
            },
          ],
          200,
          { "X-Has-More": "true" },
        ),
      )
      .mockResolvedValueOnce(
        createJsonResponse(
          [
            {
              type: "notification",
              timestamp: "2026-01-01T00:00:02Z",
              notification: {
                jsonrpc: "2.0",
                method: "_posthog/console",
                params: {
                  sessionId: "run-1",
                  level: "info",
                  message: "done-2",
                },
              },
            },
          ],
          200,
          { "X-Has-More": "false" },
        ),
      );

    service.watch({
      taskId: "task-1",
      runId: "run-1",
      apiHost: "https://app.example.com",
      teamId: 2,
    });

    await waitFor(() => updates.length >= 1);

    expect(updates).toEqual([
      {
        taskId: "task-1",
        runId: "run-1",
        kind: "snapshot",
        newEntries: [
          {
            type: "notification",
            timestamp: "2026-01-01T00:00:01Z",
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/console",
              params: {
                sessionId: "run-1",
                level: "info",
                message: "done-1",
              },
            },
          },
          {
            type: "notification",
            timestamp: "2026-01-01T00:00:02Z",
            notification: {
              jsonrpc: "2.0",
              method: "_posthog/console",
              params: {
                sessionId: "run-1",
                level: "info",
                message: "done-2",
              },
            },
          },
        ],
        totalEntryCount: 2,
        status: "completed",
        stage: "build",
        output: null,
        errorMessage: null,
        branch: "main",
      },
    ]);
    expect(mockNetFetch).toHaveBeenCalledTimes(3);
  });
});
