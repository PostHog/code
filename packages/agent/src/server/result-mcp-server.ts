import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import type { PostHogAPIClient } from "../posthog-api.js";
import { Logger } from "../utils/logger.js";

export interface ResultMcpServerConfig {
  port: number;
  outputSchema: Record<string, unknown>;
  taskId: string;
  runId: string;
  posthogAPI: PostHogAPIClient;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

/**
 * Minimal MCP Streamable HTTP server that exposes a single `submit_result` tool.
 *
 * The Claude Agent SDK connects to this as a regular MCP server. When the agent
 * calls `submit_result`, the handler validates the data and writes it to
 * `TaskRun.output` via the PostHog API.
 */
export class ResultMcpServer {
  private config: ResultMcpServerConfig;
  private logger: Logger;
  private server: ServerType | null = null;
  private app: Hono;
  private _resultSubmitted = false;

  get isResultSubmitted(): boolean {
    return this._resultSubmitted;
  }

  constructor(config: ResultMcpServerConfig) {
    this.config = config;
    this.logger = new Logger({
      debug: true,
      prefix: "[ResultMcpServer]",
    });
    this.app = this.createApp();
  }

  get url(): string {
    return `http://localhost:${this.config.port}/mcp`;
  }

  private createApp(): Hono {
    const app = new Hono();

    app.post("/mcp", async (c) => {
      let body: JsonRpcRequest;
      try {
        body = await c.req.json();
      } catch {
        this.logger.error("Failed to parse JSON-RPC request body");
        return c.json(
          { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" } },
          200,
        );
      }

      this.logger.info(`Received JSON-RPC: ${body.method}`, {
        id: body.id,
        hasParams: !!body.params,
      });

      const response = this.handleJsonRpc(body);
      if (response === null) {
        // Notification (no id) — return 202 Accepted
        return c.body(null, 202);
      }
      return c.json(response);
    });

    return app;
  }

  private handleJsonRpc(
    request: JsonRpcRequest,
  ): Record<string, unknown> | null {
    const { method, id, params } = request;

    switch (method) {
      case "initialize":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2025-03-26",
            capabilities: { tools: {} },
            serverInfo: {
              name: "posthog-result",
              version: "1.0.0",
            },
          },
        };

      case "notifications/initialized":
        // No-op acknowledgement — notification has no id
        return null;

      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [this.getToolDefinition()],
          },
        };

      case "tools/call":
        return this.handleToolCall(id, params);

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        };
    }
  }

  private getToolDefinition(): Record<string, unknown> {
    return {
      name: "submit_result",
      description:
        "Submit the final structured result for this task. Call this exactly once when you have gathered all the information needed. The data must conform to the output schema.",
      inputSchema: {
        type: "object",
        properties: {
          data: this.config.outputSchema,
        },
        required: ["data"],
      },
    };
  }

  private handleToolCall(
    id: string | number | undefined,
    params: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const toolName = params?.name as string | undefined;

    this.logger.info(`tools/call received: ${toolName}`, {
      hasArguments: !!params?.arguments,
    });

    if (toolName !== "submit_result") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `Unknown tool: ${toolName}. Only 'submit_result' is available.`,
            },
          ],
          isError: true,
        },
      };
    }

    if (this._resultSubmitted) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Result already submitted. submit_result can only be called once.",
            },
          ],
          isError: true,
        },
      };
    }

    const args = params?.arguments as Record<string, unknown> | undefined;
    const data = args?.data;

    if (data === undefined || data === null) {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: "Missing required field 'data'. Please provide the result data.",
            },
          ],
          isError: true,
        },
      };
    }

    // Fire-and-forget the API call, but track submission state synchronously
    this._resultSubmitted = true;
    this.submitResult(data);

    return {
      jsonrpc: "2.0",
      id,
      result: {
        content: [
          {
            type: "text",
            text: "Result submitted successfully.",
          },
        ],
      },
    };
  }

  private submitResult(data: unknown): void {
    this.config.posthogAPI
      .updateTaskRun(this.config.taskId, this.config.runId, {
        output: data as Record<string, unknown>,
      })
      .then(() => {
        this.logger.info("Result submitted to PostHog API", {
          taskId: this.config.taskId,
          runId: this.config.runId,
        });
      })
      .catch((error) => {
        this.logger.error("Failed to submit result to PostHog API", {
          taskId: this.config.taskId,
          runId: this.config.runId,
          error,
        });
        // Allow retry on API failure
        this._resultSubmitted = false;
      });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = serve(
        { fetch: this.app.fetch, port: this.config.port },
        () => {
          this.logger.info(
            `Result MCP server listening on port ${this.config.port}`,
          );
          resolve();
        },
      );
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.logger.info("Result MCP server stopped");
    }
  }
}
