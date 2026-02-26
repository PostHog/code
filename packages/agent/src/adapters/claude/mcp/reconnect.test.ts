import type {
  HookInput,
  McpServerStatus,
  Query,
} from "@anthropic-ai/claude-agent-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Logger } from "../../../utils/logger.js";
import { createPostToolUseFailureHook, type QueryRef } from "../hooks.js";
import { ensureMcpServersConnected } from "./reconnect.js";

function createMockQuery(statuses: McpServerStatus[] = []) {
  return {
    mcpServerStatus: vi.fn().mockResolvedValue(statuses),
    reconnectMcpServer: vi.fn().mockResolvedValue(undefined),
  } as unknown as Query & {
    mcpServerStatus: ReturnType<typeof vi.fn>;
    reconnectMcpServer: ReturnType<typeof vi.fn>;
  };
}

function serverStatus(
  name: string,
  status: McpServerStatus["status"],
): McpServerStatus {
  return { name, status } as McpServerStatus;
}

describe("ensureMcpServersConnected", () => {
  let logger: Logger;

  beforeEach(() => {
    logger = new Logger({ debug: false, prefix: "[test]" });
  });

  it("does nothing when no servers exist", async () => {
    const query = createMockQuery([]);

    await ensureMcpServersConnected(query, logger);

    expect(query.mcpServerStatus).toHaveBeenCalledOnce();
    expect(query.reconnectMcpServer).not.toHaveBeenCalled();
  });

  it("does nothing when all servers are connected", async () => {
    const query = createMockQuery([
      serverStatus("posthog", "connected"),
      serverStatus("other", "connected"),
    ]);

    await ensureMcpServersConnected(query, logger);

    expect(query.reconnectMcpServer).not.toHaveBeenCalled();
  });

  it("reconnects a failed server", async () => {
    const query = createMockQuery([serverStatus("posthog", "failed")]);

    await ensureMcpServersConnected(query, logger);

    expect(query.reconnectMcpServer).toHaveBeenCalledWith("posthog");
  });

  it("reconnects multiple failed servers in parallel", async () => {
    const query = createMockQuery([
      serverStatus("posthog", "failed"),
      serverStatus("other", "failed"),
      serverStatus("healthy", "connected"),
    ]);

    await ensureMcpServersConnected(query, logger);

    expect(query.reconnectMcpServer).toHaveBeenCalledTimes(2);
    expect(query.reconnectMcpServer).toHaveBeenCalledWith("posthog");
    expect(query.reconnectMcpServer).toHaveBeenCalledWith("other");
  });

  it("skips pending, needs-auth, and disabled servers", async () => {
    const query = createMockQuery([
      serverStatus("pending-server", "pending"),
      serverStatus("auth-server", "needs-auth"),
      serverStatus("disabled-server", "disabled"),
    ]);

    await ensureMcpServersConnected(query, logger);

    expect(query.reconnectMcpServer).not.toHaveBeenCalled();
  });

  it("continues when reconnection throws", async () => {
    const query = createMockQuery([serverStatus("posthog", "failed")]);
    query.reconnectMcpServer.mockRejectedValue(new Error("reconnect failed"));

    await expect(
      ensureMcpServersConnected(query, logger),
    ).resolves.toBeUndefined();
  });

  it("continues when mcpServerStatus throws", async () => {
    const query = createMockQuery();
    query.mcpServerStatus.mockRejectedValue(new Error("status check failed"));

    await expect(
      ensureMcpServersConnected(query, logger),
    ).resolves.toBeUndefined();

    expect(query.reconnectMcpServer).not.toHaveBeenCalled();
  });

  it("handles reconnection timeout gracefully", async () => {
    const query = createMockQuery([serverStatus("posthog", "failed")]);
    query.reconnectMcpServer.mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    await expect(
      ensureMcpServersConnected(query, logger, 50),
    ).resolves.toBeUndefined();
  });

  it("only reconnects failed servers among mixed statuses", async () => {
    const query = createMockQuery([
      serverStatus("ok", "connected"),
      serverStatus("broken", "failed"),
      serverStatus("waiting", "pending"),
      serverStatus("locked", "needs-auth"),
      serverStatus("off", "disabled"),
    ]);

    await ensureMcpServersConnected(query, logger);

    expect(query.reconnectMcpServer).toHaveBeenCalledTimes(1);
    expect(query.reconnectMcpServer).toHaveBeenCalledWith("broken");
  });
});

describe("createPostToolUseFailureHook", () => {
  let logger: Logger;
  const signal = new AbortController().signal;

  function makeHookInput(toolName: string): HookInput {
    return {
      hook_event_name: "PostToolUseFailure",
      tool_name: toolName,
      tool_input: {},
      tool_use_id: "tu_123",
      error: "server disconnected",
      session_id: "sess_1",
      transcript_path: "/tmp/transcript",
      cwd: "/tmp",
    } as HookInput;
  }

  beforeEach(() => {
    logger = new Logger({ debug: false, prefix: "[test]" });
  });

  it("skips non-MCP tool failures", async () => {
    const queryRef: QueryRef = {
      current: createMockQuery([]) as unknown as Query,
    };
    const hook = createPostToolUseFailureHook({ queryRef, logger });

    const result = await hook(makeHookInput("Bash"), undefined, { signal });

    expect(result).toEqual({ continue: true });
    expect(
      (
        queryRef.current as unknown as {
          mcpServerStatus: ReturnType<typeof vi.fn>;
        }
      ).mcpServerStatus,
    ).not.toHaveBeenCalled();
  });

  it("reconnects on MCP tool failure", async () => {
    const mockQuery = createMockQuery([serverStatus("posthog", "failed")]);
    const queryRef: QueryRef = { current: mockQuery as unknown as Query };
    const hook = createPostToolUseFailureHook({ queryRef, logger });

    const result = await hook(
      makeHookInput("mcp__posthog__search"),
      undefined,
      { signal },
    );

    expect(result).toEqual({ continue: true });
    expect(mockQuery.reconnectMcpServer).toHaveBeenCalledWith("posthog");
  });

  it("returns continue: true when queryRef is null", async () => {
    const queryRef: QueryRef = { current: null };
    const hook = createPostToolUseFailureHook({ queryRef, logger });

    const result = await hook(
      makeHookInput("mcp__posthog__search"),
      undefined,
      { signal },
    );

    expect(result).toEqual({ continue: true });
  });

  it("returns continue: true even when reconnect throws", async () => {
    const mockQuery = createMockQuery([serverStatus("posthog", "failed")]);
    mockQuery.mcpServerStatus.mockRejectedValue(new Error("boom"));
    const queryRef: QueryRef = { current: mockQuery as unknown as Query };
    const hook = createPostToolUseFailureHook({ queryRef, logger });

    const result = await hook(
      makeHookInput("mcp__posthog__search"),
      undefined,
      { signal },
    );

    expect(result).toEqual({ continue: true });
  });
});
