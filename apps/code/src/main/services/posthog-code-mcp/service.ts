import { randomUUID } from "node:crypto";
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
import {
  type AskClarificationInput,
  type AskClarificationOutput,
  askClarificationInputSchema,
  askClarificationOutputSchema,
  type ClarificationAnswer,
  type ClarificationRequestedEventPayload,
  type ClarificationResolvedEventPayload,
} from "./schemas";

const log = logger.scope("posthog-code-mcp");

export const PosthogCodeMcpEvent = {
  ClarificationRequested: "clarificationRequested",
  ClarificationResolved: "clarificationResolved",
} as const;

export interface PosthogCodeMcpEvents {
  [PosthogCodeMcpEvent.ClarificationRequested]: ClarificationRequestedEventPayload;
  [PosthogCodeMcpEvent.ClarificationResolved]: ClarificationResolvedEventPayload;
}

interface PendingRequest {
  resolve: (output: AskClarificationOutput) => void;
  reject: (error: Error) => void;
}

interface ResolveOptions {
  answers: ClarificationAnswer[];
  stop?: boolean;
}

/**
 * In-process MCP server exposing PostHog Code-specific tools to the agent.
 *
 * Currently exposes a single tool, `askClarification`, which the agent uses
 * during the Socratic scaffolding flow to surface a round of clarification
 * questions to the user. The tool call resolves only once the user submits
 * the form rendered by `ClarificationBlock` in the renderer.
 *
 * The bridge between the main-process tool handler and the renderer is:
 *   1. `askClarification` is invoked → service emits `ClarificationRequested`
 *      and stores a pending Promise keyed by request ID.
 *   2. Renderer receives the event via tRPC subscription and shows the form.
 *   3. User submits → renderer calls `posthogCodeMcp.resolveClarification`,
 *      which calls `resolveRequest()` on this service.
 *   4. Pending Promise resolves with the user's answers, the tool returns
 *      to the agent.
 */
@injectable()
export class PosthogCodeMcpService extends TypedEventEmitter<PosthogCodeMcpEvents> {
  private mcpServer: McpServer | null = null;
  private transport: StreamableHTTPServerTransport | null = null;
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

  /** Map of request ID → pending tool-call promise resolvers. */
  private readonly pending = new Map<string, PendingRequest>();
  /** Total rounds the tool has been invoked since the service started. */
  private roundsCalled = 0;

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

  private async doStart(): Promise<void> {
    const mcpServer = new McpServer(
      { name: "posthog-code", version: "1.0.0" },
      { capabilities: { tools: {} } },
    );

    mcpServer.registerTool(
      "askClarification",
      {
        title: "Ask the user a round of clarification questions",
        description:
          "Surface a round of Socratic questions to the user. Each question " +
          "carries a prefilled best-guess answer; the user can accept the " +
          "defaults or override any of them. The user may also choose to " +
          "stop further clarification rounds entirely.",
        inputSchema: askClarificationInputSchema.shape,
        outputSchema: askClarificationOutputSchema.shape,
      },
      async (rawInput) => {
        const input = askClarificationInputSchema.parse(rawInput);
        return this.handleAskClarification(input);
      },
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

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
    });

    await mcpServer.connect(transport);

    const httpServer = http.createServer((req, res) => {
      // The MCP transport is mounted at `/mcp`; reject any other path.
      const url = new URL(req.url ?? "/", "http://placeholder");
      if (url.pathname !== PosthogCodeMcpService.MCP_PATH) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      void transport.handleRequest(req, res).catch((err) => {
        log.error("posthog-code MCP transport error", { err });
        if (!res.headersSent) {
          res.writeHead(500);
          res.end("Internal error");
        }
      });
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

    this.mcpServer = mcpServer;
    this.transport = transport;
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

  /**
   * Resolve a pending clarification request with the user's answers.
   * Called from the tRPC mutation handler after the renderer submits the form.
   *
   * Returns true if a pending request matched; false if no such request
   * existed (already resolved or unknown ID).
   */
  public resolveRequest(requestId: string, options: ResolveOptions): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) {
      log.warn("Tried to resolve unknown clarification request", { requestId });
      return false;
    }
    this.pending.delete(requestId);
    entry.resolve({ answers: options.answers, stop: options.stop });
    this.emit(PosthogCodeMcpEvent.ClarificationResolved, {
      requestId,
      answers: options.answers,
      stop: options.stop,
    });
    return true;
  }

  /**
   * Get the current count of how many `askClarification` rounds have run since
   * the service started. Test helper.
   */
  public getRoundsCalled(): number {
    return this.roundsCalled;
  }

  @preDestroy()
  async stop(): Promise<void> {
    // Reject any outstanding tool calls so the agent's tool promise resolves
    // rather than hanging forever during teardown.
    for (const [, pending] of this.pending) {
      pending.reject(new Error("posthog-code MCP server is shutting down"));
    }
    this.pending.clear();

    const httpServer = this.httpServer;
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
    if (this.transport) {
      try {
        await this.transport.close();
      } catch (err) {
        log.warn("Error closing posthog-code MCP transport", { err });
      }
    }
    if (this.mcpServer) {
      try {
        await this.mcpServer.close();
      } catch (err) {
        log.warn("Error closing posthog-code MCP server", { err });
      }
    }
    this.httpServer = null;
    this.transport = null;
    this.mcpServer = null;
    this.port = null;
    this.startPromise = null;
    log.info("posthog-code MCP server stopped");
  }

  /**
   * Tool handler for `askClarification`. Public for unit tests; under normal
   * operation it's called by the MCP server runtime.
   */
  public async handleAskClarification(input: AskClarificationInput): Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: AskClarificationOutput;
    isError?: boolean;
  }> {
    // Round-cap enforcement. UX/cost guard, not a security boundary — the
    // tool returns a structured error so the agent can recover and proceed
    // to scaffolding rather than retrying forever.
    if (input.roundIndex >= input.roundsTotal) {
      const message = `Round cap reached (you've already used ${input.roundsTotal}/${input.roundsTotal} rounds). Please proceed to scaffolding.`;
      log.info("askClarification cap hit", {
        roundIndex: input.roundIndex,
        roundsTotal: input.roundsTotal,
      });
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }

    this.roundsCalled += 1;
    const requestId = randomUUID();

    const pending = new Promise<AskClarificationOutput>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
    });

    this.emit(PosthogCodeMcpEvent.ClarificationRequested, {
      requestId,
      input,
    });

    let output: AskClarificationOutput;
    try {
      output = await pending;
    } catch (err) {
      this.pending.delete(requestId);
      const message =
        err instanceof Error ? err.message : "Clarification request failed";
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output,
    };
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
