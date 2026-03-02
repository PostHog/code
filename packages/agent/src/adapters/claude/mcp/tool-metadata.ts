import type { McpServerStatus, Query } from "@anthropic-ai/claude-agent-sdk";
import { Logger } from "../../../utils/logger.js";

export interface McpToolMetadata {
  readOnly: boolean;
  name: string;
  description?: string;
}

const mcpToolMetadataCache: Map<string, McpToolMetadata> = new Map();

const PENDING_RETRY_INTERVAL_MS = 1_000;
const PENDING_MAX_RETRIES = 10;

function buildToolKey(serverName: string, toolName: string): string {
  return `mcp__${serverName}__${toolName}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchMcpToolMetadata(
  q: Query,
  logger: Logger = new Logger({ debug: false, prefix: "[McpToolMetadata]" }),
): Promise<void> {
  let retries = 0;

  while (retries <= PENDING_MAX_RETRIES) {
    let statuses: McpServerStatus[];
    try {
      statuses = await q.mcpServerStatus();
    } catch (error) {
      logger.error("Failed to fetch MCP server status", {
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const pendingServers = statuses.filter((s) => s.status === "pending");

    for (const server of statuses) {
      if (server.status !== "connected" || !server.tools) {
        continue;
      }

      let readOnlyCount = 0;
      for (const tool of server.tools) {
        const toolKey = buildToolKey(server.name, tool.name);
        const readOnly = tool.annotations?.readOnly === true;
        mcpToolMetadataCache.set(toolKey, {
          readOnly,
          name: tool.name,
          description: tool.description,
        });
        if (readOnly) readOnlyCount++;
      }

      logger.info("Fetched MCP tool metadata", {
        serverName: server.name,
        toolCount: server.tools.length,
        readOnlyCount,
      });
    }

    if (pendingServers.length === 0) {
      return;
    }

    retries++;
    if (retries > PENDING_MAX_RETRIES) {
      logger.warn("Gave up waiting for pending MCP servers", {
        pendingServers: pendingServers.map((s) => s.name),
      });
      return;
    }

    logger.info("Waiting for pending MCP servers", {
      pendingServers: pendingServers.map((s) => s.name),
      retry: retries,
    });
    await delay(PENDING_RETRY_INTERVAL_MS);
  }
}

export function getMcpToolMetadata(
  toolName: string,
): McpToolMetadata | undefined {
  return mcpToolMetadataCache.get(toolName);
}

export function isMcpToolReadOnly(toolName: string): boolean {
  const metadata = mcpToolMetadataCache.get(toolName);
  return metadata?.readOnly === true;
}

export function clearMcpToolMetadataCache(): void {
  mcpToolMetadataCache.clear();
}
