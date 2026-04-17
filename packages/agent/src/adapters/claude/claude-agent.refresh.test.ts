import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POSTHOG_METHODS } from "../../acp-extensions";
import { Pushable } from "../../utils/streams";

type SdkQueryHandle = {
  interrupt: ReturnType<typeof vi.fn>;
  setModel: ReturnType<typeof vi.fn>;
  setMcpServers: ReturnType<typeof vi.fn>;
  supportedCommands: ReturnType<typeof vi.fn>;
  initializationResult: ReturnType<typeof vi.fn>;
  [Symbol.asyncIterator]: () => AsyncIterator<never>;
};

function makeQueryHandle(): SdkQueryHandle {
  return {
    interrupt: vi.fn().mockResolvedValue(undefined),
    setModel: vi.fn().mockResolvedValue(undefined),
    setMcpServers: vi.fn().mockResolvedValue(undefined),
    supportedCommands: vi.fn().mockResolvedValue([]),
    initializationResult: vi.fn().mockResolvedValue({
      result: "success",
      commands: [],
      models: [],
    }),
    [Symbol.asyncIterator]: async function* () {
      /* never yields */
    } as never,
  };
}

const lastQueryCall: { options?: Record<string, unknown> } = {};
const createdQueries: SdkQueryHandle[] = [];

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn((params: { options: Record<string, unknown> }) => {
    lastQueryCall.options = params.options;
    const handle = makeQueryHandle();
    createdQueries.push(handle);
    return handle;
  }),
}));

vi.mock("./mcp/tool-metadata", () => ({
  fetchMcpToolMetadata: vi.fn().mockResolvedValue(undefined),
  getConnectedMcpServerNames: vi.fn().mockReturnValue([]),
}));

// Import after the mocks so ClaudeAcpAgent resolves the mocked SDK
const { ClaudeAcpAgent } = await import("./claude-agent");
type Agent = InstanceType<typeof ClaudeAcpAgent>;

function makeAgent(): Agent {
  const client = {
    sessionUpdate: vi.fn().mockResolvedValue(undefined),
    extNotification: vi.fn().mockResolvedValue(undefined),
  } as unknown as AgentSideConnection;
  return new ClaudeAcpAgent(client);
}

function installFakeSession(agent: Agent, sessionId: string) {
  const oldQuery = makeQueryHandle();
  const input = new Pushable();
  const endSpy = vi.spyOn(input, "end");

  const session = {
    query: oldQuery,
    queryOptions: {
      sessionId,
      cwd: "/tmp/repo",
      model: "claude-sonnet-4-6",
      mcpServers: { posthog: { type: "http", url: "https://old" } },
    },
    input,
    cancelled: false,
    settingsManager: { dispose: vi.fn() },
    permissionMode: "default",
    abortController: new AbortController(),
    accumulatedUsage: {
      inputTokens: 42,
      outputTokens: 17,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
    },
    configOptions: [],
    promptRunning: false,
    pendingMessages: new Map(),
    nextPendingOrder: 0,
    cwd: "/tmp/repo",
    notificationHistory: [{ foo: "bar" }],
    taskRunId: "run-1",
  } as unknown as Parameters<typeof Object.assign>[0];

  (agent as unknown as { session: unknown }).session = session;
  (agent as unknown as { sessionId: string }).sessionId = sessionId;

  return { session, oldQuery, endSpy };
}

describe("ClaudeAcpAgent.extMethod refresh_session", () => {
  beforeEach(() => {
    lastQueryCall.options = undefined;
    createdQueries.length = 0;
  });

  it("returns methodNotFound for unknown extension methods", async () => {
    const agent = makeAgent();
    await expect(agent.extMethod("_posthog/nope", {})).rejects.toThrow(
      /Method not found/i,
    );
  });

  it("rejects refresh while a prompt is in flight", async () => {
    const agent = makeAgent();
    const { session } = installFakeSession(agent, "s-1");
    (session as unknown as { promptRunning: boolean }).promptRunning = true;

    await expect(
      agent.extMethod(POSTHOG_METHODS.REFRESH_SESSION, {
        mcpServers: [
          {
            name: "posthog",
            type: "http",
            url: "https://new",
            headers: [],
          },
        ],
      }),
    ).rejects.toThrow(/prompt turn is in flight/);
  });

  it("swaps query/input/options and preserves session state", async () => {
    const agent = makeAgent();
    const { session, oldQuery, endSpy } = installFakeSession(agent, "s-2");

    const result = await agent.extMethod(POSTHOG_METHODS.REFRESH_SESSION, {
      mcpServers: [
        {
          name: "posthog",
          type: "http",
          url: "https://fresh",
          headers: [{ name: "x-foo", value: "bar" }],
        },
      ],
    });

    expect(result).toEqual({ refreshed: true });
    expect(oldQuery.interrupt).toHaveBeenCalledTimes(1);
    expect(endSpy).toHaveBeenCalledTimes(1);

    // New query was built with resume identity (not sessionId) and new servers
    expect(lastQueryCall.options).toMatchObject({
      resume: "s-2",
      forkSession: false,
      mcpServers: {
        posthog: {
          type: "http",
          url: "https://fresh",
          headers: { "x-foo": "bar" },
        },
      },
    });
    expect(lastQueryCall.options?.sessionId).toBeUndefined();

    // Session fields swapped to the new instances
    const updated = session as unknown as {
      query: SdkQueryHandle;
      input: unknown;
      queryOptions: Record<string, unknown>;
      accumulatedUsage: { inputTokens: number };
      notificationHistory: unknown[];
    };
    expect(updated.query).toBe(createdQueries[0]);
    expect(updated.query).not.toBe(oldQuery);
    expect(updated.input).toBeInstanceOf(Pushable);
    expect(updated.queryOptions).toBe(lastQueryCall.options);

    // Preserves session-level state (usage, notification history)
    expect(updated.accumulatedUsage.inputTokens).toBe(42);
    expect(updated.notificationHistory).toEqual([{ foo: "bar" }]);
  });
});
