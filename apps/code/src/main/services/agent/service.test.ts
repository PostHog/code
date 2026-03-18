import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Hoisted mocks ---

const mockApp = vi.hoisted(() => ({
  getAppPath: vi.fn(() => "/mock/appPath"),
  isPackaged: false,
  getVersion: vi.fn(() => "0.0.0-test"),
  getPath: vi.fn(() => "/mock/home"),
}));

const mockNewSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    sessionId: "test-session-id",
    configOptions: [],
  }),
);

const mockClientSideConnection = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.initialize = vi.fn().mockResolvedValue({});
    this.newSession = mockNewSession;
    this.loadSession = vi.fn().mockResolvedValue({ configOptions: [] });
    this.unstable_resumeSession = vi
      .fn()
      .mockResolvedValue({ configOptions: [] });
  }),
);

const mockAgentRun = vi.hoisted(() =>
  vi.fn().mockImplementation(() =>
    Promise.resolve({
      clientStreams: {
        readable: new ReadableStream(),
        writable: new WritableStream(),
      },
    }),
  ),
);

const mockAgentConstructor = vi.hoisted(() =>
  vi.fn().mockImplementation(function (this: Record<string, unknown>) {
    this.run = mockAgentRun;
    this.cleanup = vi.fn().mockResolvedValue(undefined);
    this.getPosthogAPI = vi.fn();
    this.flushAllLogs = vi.fn().mockResolvedValue(undefined);
  }),
);

const mockFetch = vi.hoisted(() => vi.fn());

// --- Module mocks ---

const mockPowerMonitor = vi.hoisted(() => ({
  on: vi.fn(),
}));

vi.mock("electron", () => ({
  app: mockApp,
  powerMonitor: mockPowerMonitor,
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

vi.mock("../../utils/typed-event-emitter.js", () => ({
  TypedEventEmitter: class {
    emit = vi.fn();
    on = vi.fn();
    off = vi.fn();
  },
}));

vi.mock("@posthog/agent/agent", () => ({
  Agent: mockAgentConstructor,
}));

vi.mock("@agentclientprotocol/sdk", () => ({
  ClientSideConnection: mockClientSideConnection,
  ndJsonStream: vi.fn(),
  PROTOCOL_VERSION: 1,
}));

vi.mock("@posthog/agent", () => ({
  isMcpToolReadOnly: vi.fn(() => false),
}));

vi.mock("@posthog/agent/posthog-api", () => ({
  getLlmGatewayUrl: vi.fn(() => "https://gateway.example.com"),
}));

vi.mock("@posthog/agent/gateway-models", () => ({
  fetchGatewayModels: vi.fn().mockResolvedValue([]),
  formatGatewayModelName: vi.fn(),
  getProviderName: vi.fn(),
}));

vi.mock("@posthog/agent/adapters/claude/session/jsonl-hydration", () => ({
  hydrateSessionJsonl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@shared/errors.js", () => ({
  isAuthError: vi.fn(() => false),
}));

vi.mock("node:fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs")>();
  return {
    ...original,
    default: {
      ...original,
      existsSync: vi.fn(() => false),
      realpathSync: vi.fn((p: string) => p),
    },
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    symlinkSync: vi.fn(),
    realpathSync: vi.fn((p: string) => p),
  };
});

vi.stubGlobal("fetch", mockFetch);

// --- Import after mocks ---
import { AgentService } from "./service";

// --- Test helpers ---

function createMockDependencies() {
  return {
    processTracking: {
      register: vi.fn(),
      unregister: vi.fn(),
      killByTaskId: vi.fn(),
    },
    sleepService: {
      acquire: vi.fn(),
      release: vi.fn(),
    },
    fsService: {
      readRepoFile: vi.fn(),
      writeRepoFile: vi.fn(),
    },
    posthogPluginService: {
      getPluginPath: vi.fn(() => "/mock/plugin"),
    },
    authProxy: {
      start: vi.fn().mockResolvedValue("http://127.0.0.1:9999"),
      stop: vi.fn().mockResolvedValue(undefined),
      updateToken: vi.fn(),
      getProxyUrl: vi.fn(() => "http://127.0.0.1:9999"),
      isRunning: vi.fn(() => false),
    },
  };
}

const baseSessionParams = {
  taskId: "task-1",
  taskRunId: "run-1",
  repoPath: "/mock/repo",
  apiKey: "test-api-key",
  apiHost: "https://app.posthog.com",
  projectId: 1,
};

describe("AgentService", () => {
  let service: AgentService;

  beforeEach(() => {
    vi.clearAllMocks();

    // MCP installations endpoint returns empty
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const deps = createMockDependencies();
    service = new AgentService(
      deps.processTracking as never,
      deps.sleepService as never,
      deps.fsService as never,
      deps.posthogPluginService as never,
      deps.authProxy as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("MCP servers", () => {
    it("passes MCP servers to newSession for codex adapter", async () => {
      await service.startSession({
        ...baseSessionParams,
        adapter: "codex",
      });

      expect(mockNewSession).toHaveBeenCalledTimes(1);
      const mcpServers = mockNewSession.mock.calls[0][0].mcpServers;
      expect(mcpServers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "posthog",
            type: "http",
            url: "https://mcp.posthog.com/mcp",
          }),
        ]),
      );
    });

    it("passes MCP servers to newSession for claude adapter", async () => {
      await service.startSession({
        ...baseSessionParams,
        adapter: "claude",
      });

      expect(mockNewSession).toHaveBeenCalledTimes(1);
      const mcpServers = mockNewSession.mock.calls[0][0].mcpServers;
      expect(mcpServers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: "posthog",
            type: "http",
            url: "https://mcp.posthog.com/mcp",
          }),
        ]),
      );
    });

    it("passes identical MCP servers regardless of adapter", async () => {
      await service.startSession({
        ...baseSessionParams,
        taskRunId: "run-claude",
        adapter: "claude",
      });

      await service.startSession({
        ...baseSessionParams,
        taskRunId: "run-codex",
        adapter: "codex",
      });

      const claudeMcp = mockNewSession.mock.calls[0][0].mcpServers;
      const codexMcp = mockNewSession.mock.calls[1][0].mcpServers;
      expect(codexMcp).toEqual(claudeMcp);
    });

    it("includes user-installed MCP servers from backend", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: "inst-1",
                url: "https://custom-mcp.example.com",
                proxy_url: "https://proxy.posthog.com/inst-1/",
                name: "custom-server",
                display_name: "Custom Server",
                auth_type: "none",
                is_enabled: true,
                pending_oauth: false,
                needs_reauth: false,
              },
            ],
          }),
      });

      await service.startSession({
        ...baseSessionParams,
        adapter: "codex",
      });

      const mcpServers = mockNewSession.mock.calls[0][0].mcpServers;
      expect(mcpServers).toHaveLength(2);
      expect(mcpServers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "posthog" }),
          expect.objectContaining({
            name: "custom-server",
            url: "https://custom-mcp.example.com",
          }),
        ]),
      );
    });
  });

  describe("idle timeout", () => {
    function injectSession(
      svc: AgentService,
      taskRunId: string,
      overrides: Record<string, unknown> = {},
    ) {
      const sessions = (svc as unknown as { sessions: Map<string, unknown> })
        .sessions;
      sessions.set(taskRunId, {
        taskRunId,
        taskId: `task-for-${taskRunId}`,
        repoPath: "/mock/repo",
        agent: { cleanup: vi.fn().mockResolvedValue(undefined) },
        clientSideConnection: {},
        channel: `ch-${taskRunId}`,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        config: {},
        promptPending: false,
        ...overrides,
      });
    }

    function getIdleTimeouts(svc: AgentService) {
      return (
        svc as unknown as {
          idleTimeouts: Map<
            string,
            { handle: ReturnType<typeof setTimeout>; deadline: number }
          >;
        }
      ).idleTimeouts;
    }

    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("recordActivity is a no-op for unknown sessions", () => {
      service.recordActivity("unknown-run");
      expect(getIdleTimeouts(service).size).toBe(0);
    });

    it("recordActivity sets a timeout for a known session", () => {
      injectSession(service, "run-1");
      service.recordActivity("run-1");
      expect(getIdleTimeouts(service).has("run-1")).toBe(true);
    });

    it("recordActivity resets the timeout on subsequent calls", () => {
      injectSession(service, "run-1");
      service.recordActivity("run-1");
      const firstDeadline = getIdleTimeouts(service).get("run-1")?.deadline;

      vi.advanceTimersByTime(5 * 60 * 1000);
      service.recordActivity("run-1");
      const secondDeadline = getIdleTimeouts(service).get("run-1")?.deadline;

      expect(secondDeadline).toBeGreaterThan(firstDeadline!);
    });

    it("kills idle session after timeout expires", () => {
      injectSession(service, "run-1");
      service.recordActivity("run-1");

      vi.advanceTimersByTime(15 * 60 * 1000);

      expect(service.emit).toHaveBeenCalledWith(
        "session-idle-killed",
        expect.objectContaining({ taskRunId: "run-1" }),
      );
    });

    it("does not kill session if activity is recorded before timeout", () => {
      injectSession(service, "run-1");
      service.recordActivity("run-1");

      vi.advanceTimersByTime(14 * 60 * 1000);
      service.recordActivity("run-1");
      vi.advanceTimersByTime(14 * 60 * 1000);

      expect(service.emit).not.toHaveBeenCalledWith(
        "session-idle-killed",
        expect.anything(),
      );
    });

    it("reschedules when promptPending is true at timeout", () => {
      injectSession(service, "run-1", { promptPending: true });
      service.recordActivity("run-1");

      vi.advanceTimersByTime(15 * 60 * 1000);

      expect(service.emit).not.toHaveBeenCalledWith(
        "session-idle-killed",
        expect.anything(),
      );
      expect(getIdleTimeouts(service).has("run-1")).toBe(true);
    });

    it("checkIdleDeadlines kills expired sessions on resume", () => {
      injectSession(service, "run-1");
      service.recordActivity("run-1");

      const resumeHandler = mockPowerMonitor.on.mock.calls.find(
        ([event]: string[]) => event === "resume",
      )?.[1] as () => void;
      expect(resumeHandler).toBeDefined();

      vi.advanceTimersByTime(20 * 60 * 1000);
      resumeHandler();

      expect(service.emit).toHaveBeenCalledWith(
        "session-idle-killed",
        expect.objectContaining({ taskRunId: "run-1" }),
      );
    });

    it("checkIdleDeadlines does not kill non-expired sessions", () => {
      injectSession(service, "run-1");
      service.recordActivity("run-1");

      const resumeHandler = mockPowerMonitor.on.mock.calls.find(
        ([event]: string[]) => event === "resume",
      )?.[1] as () => void;

      vi.advanceTimersByTime(5 * 60 * 1000);
      resumeHandler();

      expect(service.emit).not.toHaveBeenCalledWith(
        "session-idle-killed",
        expect.anything(),
      );
    });
  });
});
