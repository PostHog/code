import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { inject, injectable, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import {
  registerPreviewInputSchema,
  registerPreviewOutputSchema,
} from "../preview/schemas";
import type { PreviewService } from "../preview/service";
import type { ScratchpadService } from "../scratchpad/service";

const log = logger.scope("posthog-code-mcp");

// Event channel reserved for future tools — no events emitted today since
// `askClarification` (the only consumer) was removed in favour of Claude's
// built-in `AskUserQuestion` tool.
type PosthogCodeMcpEvents = Record<string, never>;

/**
 * In-process MCP server exposing PostHog Code-specific tools to the agent.
 *
 * Currently exposes a single tool, `registerPreview`, used by the agent to
 * announce a running dev server so the host can spawn the supervised
 * process and open a Preview tab. Clarification questions during scaffolding
 * are handled by Claude's built-in `AskUserQuestion` tool — we don't need
 * a custom MCP equivalent.
 */
@injectable()
export class PosthogCodeMcpService extends TypedEventEmitter<PosthogCodeMcpEvents> {
  private httpServer: http.Server | null = null;
  private port: number | null = null;
  private startPromise: Promise<void> | null = null;

  constructor(
    @inject(MAIN_TOKENS.PreviewService)
    private readonly previewService: PreviewService,
    @inject(MAIN_TOKENS.ScratchpadService)
    private readonly scratchpadService: ScratchpadService,
  ) {
    super();
  }

  /** The HTTP path the MCP transport accepts. */
  public static readonly MCP_PATH = "/mcp";
  /** The MCP server name as exposed to Claude Code (becomes `mcp__posthog_code__*`). */
  public static readonly SERVER_NAME = "posthog_code";

  /**
   * Start the in-process MCP server. Idempotent: safe to call repeatedly.
   */
  public async start(): Promise<void> {
    if (this.httpServer && this.port) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().catch((err) => {
      this.startPromise = null;
      throw err;
    });
    return this.startPromise;
  }

  /**
   * Build a fresh MCP server instance with all tools registered.
   * Stateless StreamableHTTP requires a new server + transport per request,
   * so we factor server creation out of the lifecycle.
   */
  private buildMcpServer(): McpServer {
    const mcpServer = new McpServer(
      { name: "posthog-code", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    mcpServer.registerTool(
      "registerPreview",
      {
        title: "Register a running dev server as a preview",
        description:
          "Declare that a development server you started is now running on " +
          "the given port. Once the server passes a health check, the user " +
          "sees a Preview tab pointing at http://127.0.0.1:{port}. Pass " +
          "`taskId` so the preview is associated with the correct scratchpad.",
        inputSchema: registerPreviewInputSchema.shape,
        outputSchema: registerPreviewOutputSchema.shape,
      },
      async (rawInput) => {
        const input = registerPreviewInputSchema.parse(rawInput);
        return this.handleRegisterPreview(input);
      },
    );

    return mcpServer;
  }

  private async doStart(): Promise<void> {
    const httpServer = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://placeholder");
      if (url.pathname !== PosthogCodeMcpService.MCP_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      // Per-request server + transport. The MCP SDK's stateless mode
      // (`sessionIdGenerator: undefined`) requires this — sharing one
      // transport across requests works for the first call but breaks tool
      // discovery on subsequent ones (and on agent reconnect after an app
      // restart, when the agent re-runs `tools/list`).
      const server = this.buildMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res);
      } catch (err) {
        log.error("posthog-code MCP transport error", { err });
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal error");
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.listen(0, "127.0.0.1", () => {
        const addr = httpServer.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
          log.info("posthog-code MCP server started", { port: this.port });
          resolve();
        } else {
          reject(new Error("Failed to get posthog-code MCP server address"));
        }
      });
      httpServer.on("error", (err) => {
        log.error("posthog-code MCP server error", { err });
        reject(err);
      });
    });

    this.httpServer = httpServer;
  }

  /**
   * URL the agent should connect to for this MCP server. Throws if the server
   * has not started yet.
   */
  public getServerUrl(): string {
    if (!this.port) {
      throw new Error("posthog-code MCP server not started");
    }
    return `http://127.0.0.1:${this.port}${PosthogCodeMcpService.MCP_PATH}`;
  }

  @preDestroy()
  async stop(): Promise<void> {
    const httpServer = this.httpServer;
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    this.httpServer = null;
    this.port = null;
    this.startPromise = null;
    log.info("posthog-code MCP server stopped");
  }

  /**
   * Tool handler for `registerPreview`. Resolves only after the spawned
   * dev server passes the health probe (or the timeout fires).
   */
  public async handleRegisterPreview(input: {
    taskId: string;
    name: string;
    command: string;
    port: number;
    cwd?: string;
    healthPath?: string;
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: { url: string };
    isError?: boolean;
  }> {
    let scratchpadRoot: string | null;
    try {
      scratchpadRoot = await this.scratchpadService.getScratchpadPath(
        input.taskId,
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to resolve scratchpad";
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
    if (!scratchpadRoot) {
      return {
        content: [
          {
            type: "text",
            text: `No scratchpad found for taskId "${input.taskId}"`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await this.previewService.register({
        taskId: input.taskId,
        scratchpadRoot,
        name: input.name,
        command: input.command,
        port: input.port,
        cwd: input.cwd,
        healthPath: input.healthPath,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "registerPreview failed";
      log.warn("registerPreview failed", { taskId: input.taskId, message });
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  }
}
