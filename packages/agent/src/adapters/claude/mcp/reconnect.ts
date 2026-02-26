import type { McpServerStatus, Query } from "@anthropic-ai/claude-agent-sdk";
import { withTimeout } from "../../../utils/common.js";
import type { Logger } from "../../../utils/logger.js";

const MCP_RECONNECT_TIMEOUT_MS = 10_000;

/**
 * Checks all MCP servers and reconnects any with a "failed" status.
 * Best-effort: logs warnings on failure but never throws, so the
 * prompt can proceed even if reconnection is unsuccessful.
 */
export async function ensureMcpServersConnected(
  query: Query,
  logger: Logger,
  timeoutMs: number = MCP_RECONNECT_TIMEOUT_MS,
): Promise<void> {
  let statuses: McpServerStatus[];
  try {
    statuses = await query.mcpServerStatus();
  } catch (err) {
    logger.warn("Failed to check MCP server status", { error: err });
    return;
  }

  const failedServers = statuses.filter((s) => s.status === "failed");
  if (failedServers.length === 0) {
    return;
  }

  logger.info("Reconnecting failed MCP servers", {
    servers: failedServers.map((s) => s.name),
  });

  const reconnectPromises = failedServers.map(async (server) => {
    try {
      const result = await withTimeout(
        query.reconnectMcpServer(server.name),
        timeoutMs,
      );
      if (result.result === "timeout") {
        logger.warn("MCP server reconnection timed out", {
          server: server.name,
        });
      } else {
        logger.info("MCP server reconnected", { server: server.name });
      }
    } catch (err) {
      logger.warn("Failed to reconnect MCP server", {
        server: server.name,
        error: err,
      });
    }
  });

  await Promise.all(reconnectPromises);
}
