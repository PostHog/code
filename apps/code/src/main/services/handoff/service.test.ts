import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetChangedFilesHead = vi.hoisted(() => vi.fn());
const mockReconnectSession = vi.hoisted(() => vi.fn());
const mockCancelSession = vi.hoisted(() => vi.fn());
const mockSetPendingContext = vi.hoisted(() => vi.fn());
const mockSendCommand = vi.hoisted(() => vi.fn());
const mockCreatePosthogConfig = vi.hoisted(() => vi.fn());
const mockUpdateMode = vi.hoisted(() => vi.fn());
const mockNetFetch = vi.hoisted(() => vi.fn());

vi.mock("@main/utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

vi.mock("@main/utils/typed-event-emitter", () => ({
  TypedEventEmitter: class {
    emit = vi.fn();
  },
}));

vi.mock("inversify", () => ({
  injectable: () => (target: unknown) => target,
  inject: () => () => undefined,
}));

vi.mock("electron", () => ({
  app: { getPath: () => "/home" },
  net: { fetch: mockNetFetch },
}));

vi.mock("@posthog/agent/posthog-api", () => ({
  PostHogAPIClient: vi.fn(),
}));

vi.mock("@posthog/agent/tree-tracker", () => ({
  TreeTracker: vi.fn().mockImplementation(() => ({
    applyTreeSnapshot: vi.fn(),
  })),
}));

vi.mock("@main/di/tokens", () => ({
  MAIN_TOKENS: {
    GitService: Symbol("GitService"),
    AgentService: Symbol("AgentService"),
    CloudTaskService: Symbol("CloudTaskService"),
    AgentAuthAdapter: Symbol("AgentAuthAdapter"),
    WorkspaceRepository: Symbol("WorkspaceRepository"),
  },
}));

import type { HandoffPreflightInput } from "./schemas";
import { HandoffService } from "./service";

function createService(): HandoffService {
  const gitService = { getChangedFilesHead: mockGetChangedFilesHead } as never;
  const agentService = {
    reconnectSession: mockReconnectSession,
    cancelSession: mockCancelSession,
    setPendingContext: mockSetPendingContext,
  } as never;
  const cloudTaskService = { sendCommand: mockSendCommand } as never;
  const agentAuthAdapter = {
    createPosthogConfig: mockCreatePosthogConfig,
  } as never;
  const workspaceRepo = { updateMode: mockUpdateMode } as never;

  return new HandoffService(
    gitService,
    agentService,
    cloudTaskService,
    agentAuthAdapter,
    workspaceRepo,
  );
}

function createPreflightInput(
  overrides: Partial<HandoffPreflightInput> = {},
): HandoffPreflightInput {
  return {
    taskId: "task-1",
    runId: "run-1",
    repoPath: "/repo/path",
    apiHost: "https://us.posthog.com",
    teamId: 2,
    ...overrides,
  };
}

describe("HandoffService.preflight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns canHandoff=true when working tree is clean", async () => {
    mockGetChangedFilesHead.mockResolvedValue([]);

    const service = createService();
    const result = await service.preflight(createPreflightInput());

    expect(result.canHandoff).toBe(true);
    expect(result.localTreeDirty).toBe(false);
    expect(result.reason).toBeUndefined();
  });

  it("returns canHandoff=false when working tree has changes", async () => {
    mockGetChangedFilesHead.mockResolvedValue([
      { path: "src/index.ts", status: "M" },
    ]);

    const service = createService();
    const result = await service.preflight(createPreflightInput());

    expect(result.canHandoff).toBe(false);
    expect(result.localTreeDirty).toBe(true);
    expect(result.reason).toContain("uncommitted changes");
  });

  it("checks the correct repo path", async () => {
    mockGetChangedFilesHead.mockResolvedValue([]);

    const service = createService();
    await service.preflight(createPreflightInput({ repoPath: "/custom/path" }));

    expect(mockGetChangedFilesHead).toHaveBeenCalledWith("/custom/path");
  });

  it("returns canHandoff=true when git check throws", async () => {
    mockGetChangedFilesHead.mockRejectedValue(new Error("git not found"));

    const service = createService();
    const result = await service.preflight(createPreflightInput());

    expect(result.canHandoff).toBe(true);
    expect(result.localTreeDirty).toBe(false);
  });
});
