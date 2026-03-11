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

const mockSetupSkills = vi.hoisted(() => vi.fn().mockResolvedValue(() => {}));

// --- Module mocks ---

vi.mock("electron", () => ({
  app: mockApp,
  net: { fetch: vi.fn() },
}));

vi.mock("@posthog/agent/skills/setup-skills", () => ({
  setupSkills: mockSetupSkills,
}));

vi.mock("../posthog-analytics.js", () => ({
  captureException: vi.fn(),
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
import { AgentService } from "./service.js";

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
});
