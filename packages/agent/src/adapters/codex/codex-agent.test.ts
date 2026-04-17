import { Readable, Writable } from "node:stream";
import type {
  AgentSideConnection,
  LoadSessionResponse,
  NewSessionResponse,
} from "@agentclientprotocol/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCodexConnection = {
  initialize: vi.fn(),
  newSession: vi.fn(),
  loadSession: vi.fn(),
  setSessionMode: vi.fn(),
  listSessions: vi.fn(),
  prompt: vi.fn(),
  setSessionConfigOption: vi.fn(),
};

const mockKill = vi.fn();

vi.mock("@agentclientprotocol/sdk", async () => {
  const actual = await vi.importActual("@agentclientprotocol/sdk");

  return {
    ...actual,
    ClientSideConnection: vi.fn(() => mockCodexConnection),
    ndJsonStream: vi.fn(() => ({}) as object),
  };
});

vi.mock("./spawn", () => ({
  spawnCodexProcess: vi.fn(() => ({
    process: { pid: 1234 },
    stdin: new Writable({
      write(_chunk, _encoding, callback) {
        callback();
      },
    }),
    stdout: new Readable({
      read() {},
    }),
    kill: mockKill,
  })),
}));

vi.mock("./settings", () => ({
  CodexSettingsManager: vi.fn().mockImplementation((cwd: string) => ({
    initialize: vi.fn(),
    dispose: vi.fn(),
    getCwd: () => cwd,
    setCwd: vi.fn(),
    getSettings: () => ({}),
  })),
}));

import { CodexAcpAgent } from "./codex-agent";

describe("CodexAcpAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createAgent(overrides: Partial<AgentSideConnection> = {}): {
    agent: CodexAcpAgent;
    client: AgentSideConnection & {
      extNotification: ReturnType<typeof vi.fn>;
      sessionUpdate: ReturnType<typeof vi.fn>;
    };
  } {
    const client = {
      extNotification: vi.fn(),
      sessionUpdate: vi.fn(),
      ...overrides,
    } as unknown as AgentSideConnection & {
      extNotification: ReturnType<typeof vi.fn>;
      sessionUpdate: ReturnType<typeof vi.fn>;
    };

    const agent = new CodexAcpAgent(client, {
      codexProcessOptions: {
        cwd: process.cwd(),
      },
    });
    return { agent, client };
  }

  it("applies the requested initial mode for a new session", async () => {
    const { agent } = createAgent();
    mockCodexConnection.newSession.mockResolvedValue({
      sessionId: "session-1",
      modes: { currentModeId: "auto", availableModes: [] },
      configOptions: [],
    } satisfies Partial<NewSessionResponse>);

    await agent.newSession({
      cwd: process.cwd(),
      _meta: { permissionMode: "read-only" },
    } as never);

    expect(mockCodexConnection.setSessionMode).toHaveBeenCalledWith({
      sessionId: "session-1",
      modeId: "read-only",
    });
    expect(
      (agent as unknown as { sessionState: { permissionMode: string } })
        .sessionState.permissionMode,
    ).toBe("read-only");
  });

  it("preserves the live session mode when loading an existing session", async () => {
    const { agent } = createAgent();
    mockCodexConnection.loadSession.mockResolvedValue({
      modes: { currentModeId: "read-only", availableModes: [] },
      configOptions: [],
    } satisfies Partial<LoadSessionResponse>);

    await agent.loadSession({
      sessionId: "session-1",
      cwd: process.cwd(),
      _meta: { permissionMode: "auto" },
    } as never);

    expect(mockCodexConnection.setSessionMode).not.toHaveBeenCalled();
    expect(
      (agent as unknown as { sessionState: { permissionMode: string } })
        .sessionState.permissionMode,
    ).toBe("read-only");
  });

  it("broadcasts user prompt as user_message_chunk before delegating to codex-acp", async () => {
    const { agent, client } = createAgent();
    // Seed an active session so prompt() has the state it expects.
    mockCodexConnection.newSession.mockResolvedValue({
      sessionId: "session-1",
      modes: { currentModeId: "auto", availableModes: [] },
      configOptions: [],
    } satisfies Partial<NewSessionResponse>);
    await agent.newSession({
      cwd: process.cwd(),
    } as never);

    const callOrder: string[] = [];
    client.sessionUpdate.mockImplementation(async () => {
      callOrder.push("sessionUpdate");
    });
    mockCodexConnection.prompt.mockImplementation(async () => {
      callOrder.push("prompt");
      return { stopReason: "end_turn" };
    });

    await agent.prompt({
      sessionId: "session-1",
      prompt: [
        { type: "text", text: "first chunk" },
        { type: "text", text: "second chunk" },
      ],
    } as never);

    expect(client.sessionUpdate).toHaveBeenCalledTimes(2);
    expect(client.sessionUpdate).toHaveBeenNthCalledWith(1, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "first chunk" },
      },
    });
    expect(client.sessionUpdate).toHaveBeenNthCalledWith(2, {
      sessionId: "session-1",
      update: {
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "second chunk" },
      },
    });
    // Broadcast must land before the prompt reaches codex-acp so the user
    // turn is persisted even if the underlying prompt fails.
    expect(callOrder).toEqual(["sessionUpdate", "sessionUpdate", "prompt"]);
  });
});
