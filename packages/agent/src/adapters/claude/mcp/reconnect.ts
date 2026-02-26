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
  logger.info("[MCP reconnect] checking server statuses...");
  let statuses: McpServerStatus[];
  try {
    statuses = await query.mcpServerStatus();
  } catch (err) {
    logger.warn("[MCP reconnect] mcpServerStatus() threw", { error: err });
    return;
  }
  logger.info("MCP server statuses", { statuses });
  logger.info("[MCP reconnect] all server statuses", {
    statuses: statuses.map((s) => ({
      name: s.name,
      status: s.status,
      error: s.error,
    })),
  });

  const failedServers = statuses.filter((s) => s.status === "failed");
  if (failedServers.length === 0) {
    logger.info("[MCP reconnect] no failed servers, skipping reconnect");
    return;
  }

  logger.info("[MCP reconnect] reconnecting failed servers", {
    servers: failedServers.map((s) => s.name),
  });

  const reconnectPromises = failedServers.map(async (server) => {
    try {
      const result = await withTimeout(
        query.reconnectMcpServer(server.name),
        timeoutMs,
      );
      if (result.result === "timeout") {
        logger.warn("[MCP reconnect] reconnection timed out", {
          server: server.name,
        });
      } else {
        logger.info("[MCP reconnect] reconnected successfully", {
          server: server.name,
        });
      }
    } catch (err) {
      logger.warn("[MCP reconnect] reconnection failed", {
        server: server.name,
        error: err,
      });
    }
  });

  await Promise.all(reconnectPromises);
  logger.info("[MCP reconnect] done");
}
