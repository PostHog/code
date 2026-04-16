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

  function createAgent(): CodexAcpAgent {
    const client = {
      extNotification: vi.fn(),
    } as unknown as AgentSideConnection;

    return new CodexAcpAgent(client, {
      codexProcessOptions: {
        cwd: process.cwd(),
      },
    });
  }

  it("applies the requested initial mode for a new session", async () => {
    const agent = createAgent();
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
    expect((agent as unknown as { sessionState: { permissionMode: string } }).sessionState.permissionMode).toBe(
      "read-only",
    );
  });

  it("preserves the live session mode when loading an existing session", async () => {
    const agent = createAgent();
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
    expect((agent as unknown as { sessionState: { permissionMode: string } }).sessionState.permissionMode).toBe(
      "read-only",
    );
  });
});
