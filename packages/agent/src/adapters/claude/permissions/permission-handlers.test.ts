import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearMcpToolMetadataCache,
  setMcpToolApprovalStates,
} from "../mcp/tool-metadata";
import { canUseTool } from "./permission-handlers";

function createContext(
  toolName: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    session: {
      permissionMode: "default" as const,
      settingsManager: {
        getRepoRoot: vi.fn().mockReturnValue("/repo"),
      },
      ...((overrides.session as Record<string, unknown>) ?? {}),
    },
    toolName,
    toolInput: {},
    toolUseID: "test-tool-use-id",
    suggestions: undefined,
    signal: undefined,
    client: {
      sessionUpdate: vi.fn().mockResolvedValue(undefined),
      requestPermission: vi.fn().mockResolvedValue({
        outcome: { outcome: "selected", optionId: "allow" },
      }),
    },
    sessionId: "test-session",
    fileContentCache: {},
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    updateConfigOption: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as Parameters<typeof canUseTool>[0];
}

describe("canUseTool MCP approval enforcement", () => {
  beforeEach(() => {
    clearMcpToolMetadataCache();
  });

  it("denies do_not_use MCP tools with correct message", async () => {
    setMcpToolApprovalStates({
      mcp__server__blocked_tool: "do_not_use",
    });

    const result = await canUseTool(createContext("mcp__server__blocked_tool"));

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("Settings > MCP Servers");
      expect(result.message).toContain("PostHog Code");
      expect(result.interrupt).toBe(false);
    }
  });

  it("routes needs_approval MCP tools to permission dialog with descriptive title", async () => {
    setMcpToolApprovalStates({
      mcp__HubSpot__search_crm_objects: "needs_approval",
    });

    const context = createContext("mcp__HubSpot__search_crm_objects");
    const result = await canUseTool(context);

    expect(result.behavior).toBe("allow");
    expect(context.client.requestPermission).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCall: expect.objectContaining({
          title: "The agent wants to call search_crm_objects (HubSpot)",
        }),
      }),
    );
  });

  it("allows approved MCP tools through normal flow", async () => {
    setMcpToolApprovalStates({
      mcp__server__approved_tool: "approved",
    });

    const result = await canUseTool(
      createContext("mcp__server__approved_tool"),
    );

    // Approved falls through to isToolAllowedForMode; MCP tools without
    // readOnly annotation are not auto-allowed, so they go to the default
    // permission flow which calls requestPermission
    expect(result.behavior).toBe("allow");
  });

  it("falls through for MCP tools with no approval state", async () => {
    const context = createContext("mcp__server__unknown_tool");
    const result = await canUseTool(context);

    // No approval state → falls through to isToolAllowedForMode → not allowed
    // in default mode → goes to default permission flow
    expect(result.behavior).toBe("allow");
    expect(context.client.requestPermission).toHaveBeenCalled();
  });

  it("blocks do_not_use even on read-only MCP tools", async () => {
    setMcpToolApprovalStates({
      mcp__server__readonly_blocked: "do_not_use",
    });

    const result = await canUseTool(
      createContext("mcp__server__readonly_blocked"),
    );

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("blocked");
    }
  });

  it("blocks do_not_use even in bypassPermissions mode", async () => {
    setMcpToolApprovalStates({
      mcp__server__blocked_bypass: "do_not_use",
    });

    const result = await canUseTool(
      createContext("mcp__server__blocked_bypass", {
        session: { permissionMode: "bypassPermissions" },
      }),
    );

    expect(result.behavior).toBe("deny");
    if (result.behavior === "deny") {
      expect(result.message).toContain("blocked");
    }
  });

  it("does not affect non-MCP tools", async () => {
    const result = await canUseTool(createContext("Read"));

    // Read is in the auto-allowed set for default mode
    expect(result.behavior).toBe("allow");
  });

  it("emits tool denial notification for do_not_use", async () => {
    setMcpToolApprovalStates({
      mcp__server__denied_tool: "do_not_use",
    });

    const context = createContext("mcp__server__denied_tool");
    await canUseTool(context);

    expect(context.client.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "test-session",
        update: expect.objectContaining({
          sessionUpdate: "tool_call_update",
          toolCallId: "test-tool-use-id",
          status: "failed",
        }),
      }),
    );
  });
});
