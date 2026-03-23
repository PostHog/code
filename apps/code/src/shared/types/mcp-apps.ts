import type {
  McpUiResourceCsp,
  McpUiResourcePermissions,
} from "@modelcontextprotocol/ext-apps/app-bridge";
import { z } from "zod";

// --- UI Resources ---

export const mcpUiResourceSchema = z.object({
  uri: z.string(),
  name: z.string().optional(),
  mimeType: z.string(),
  csp: z
    .object({
      connectDomains: z.array(z.string()).optional(),
      resourceDomains: z.array(z.string()).optional(),
      frameDomains: z.array(z.string()).optional(),
      baseUriDomains: z.array(z.string()).optional(),
    })
    .optional(),
  permissions: z
    .object({
      camera: z.object({}).optional(),
      microphone: z.object({}).optional(),
      geolocation: z.object({}).optional(),
      clipboardWrite: z.object({}).optional(),
    })
    .optional(),
  html: z.string(),
  serverName: z.string(),
});

export interface McpUiResource {
  uri: string;
  name?: string;
  mimeType: string;
  csp?: McpUiResourceCsp;
  permissions?: McpUiResourcePermissions;
  html: string;
  serverName: string;
}

// --- MCP extension metadata shapes ---
// The MCP SDK types don't expose the `_meta.ui` extension fields, so we define
// them here for use when casting raw SDK tool/resource objects.

export type McpToolUiVisibility = "model" | "app";

/** Shape of the `_meta.ui` field on MCP tool definitions that have a UI. */
export interface McpToolUiMeta {
  _meta?: {
    ui?: {
      resourceUri?: string;
      visibility?: McpToolUiVisibility[];
    };
  };
}

/** Shape of MCP resource definitions that carry `_meta.ui` CSP/permissions. */
export interface McpResourceUiMeta {
  uri: string;
  name?: string;
  _meta?: {
    ui?: {
      csp?: McpUiResource["csp"];
      permissions?: McpUiResource["permissions"];
    };
  };
}

/** Tool-to-UI associations */
export const mcpToolUiAssociationSchema = z.object({
  toolKey: z.string(),
  serverName: z.string(),
  toolName: z.string(),
  resourceUri: z.string(),
  visibility: z.array(z.enum(["model", "app"])).optional(),
});

export type McpToolUiAssociation = z.infer<typeof mcpToolUiAssociationSchema>;

// --- tRPC input/output schemas ---

export const getUiResourceInput = z.object({
  toolKey: z.string(),
});

export const hasUiForToolInput = z.object({
  toolKey: z.string(),
});

export const getToolDefinitionInput = z.object({
  toolKey: z.string(),
});

export const proxyToolCallInput = z.object({
  serverName: z.string(),
  toolName: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
});

export const proxyResourceReadInput = z.object({
  serverName: z.string(),
  uri: z.string(),
});

export const openLinkInput = z.object({
  url: z.string(),
});

export const mcpAppsSubscriptionInput = z.object({
  toolKey: z.string(),
});

// --- Service event types ---

export interface McpAppsToolInputEvent {
  toolKey: string;
  toolCallId: string;
  args: unknown;
}

export interface McpAppsToolResultEvent {
  toolKey: string;
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

export interface McpAppsToolCancelledEvent {
  toolKey: string;
  toolCallId: string;
}

export interface McpAppsDiscoveryCompleteEvent {
  toolKeys: string[];
}

export const McpAppsServiceEvent = {
  ToolInput: "tool-input",
  ToolResult: "tool-result",
  ToolCancelled: "tool-cancelled",
  DiscoveryComplete: "discovery-complete",
} as const;

export interface McpAppsServiceEvents {
  [McpAppsServiceEvent.ToolInput]: McpAppsToolInputEvent;
  [McpAppsServiceEvent.ToolResult]: McpAppsToolResultEvent;
  [McpAppsServiceEvent.ToolCancelled]: McpAppsToolCancelledEvent;
  [McpAppsServiceEvent.DiscoveryComplete]: McpAppsDiscoveryCompleteEvent;
}

// --- MCP server connection config ---

export interface McpServerConnectionConfig {
  name: string;
  url: string;
  headers: Record<string, string>;
}
