import { randomBytes } from "node:crypto";
import http from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { inject, injectable, preDestroy } from "inversify";
import { z } from "zod";
import { MAIN_TOKENS } from "../../di/tokens";
import { decrypt, encrypt } from "../../utils/encryption";
import { logger } from "../../utils/logger";
import { rendererStore } from "../../utils/store";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { AuthService } from "../auth/service";
import {
  PostHogCodeInternalMcpEvent,
  type PostHogCodeInternalMcpEvents,
} from "./schemas";

const log = logger.scope("posthog-code-internal-mcp");

const SETTINGS_STORE_KEY = "settings-storage";
const SERVER_NAME = "posthog-code-internal";
const SERVER_VERSION = "1.0.0";

/**
 * Local-only HTTP MCP server that exposes a few self-modification tools to
 * the running agent: read/write the user's custom instructions, and
 * list/add MCP server installations on the active project.
 *
 * Mirrors {@link McpProxyService}: listens on 127.0.0.1, generates a random
 * bearer token at boot, and dies with the app via @preDestroy.
 */
@injectable()
export class PostHogCodeInternalMcpService extends TypedEventEmitter<PostHogCodeInternalMcpEvents> {
  private server: http.Server | null = null;
  private port: number | null = null;
  private bearerToken: string | null = null;
  private startPromise: Promise<void> | null = null;

  constructor(
    @inject(MAIN_TOKENS.AuthService)
    private readonly authService: AuthService,
  ) {
    super();
  }

  async start(): Promise<void> {
    if (this.server && this.port) return;
    if (this.startPromise) return this.startPromise;
    this.startPromise = this.doStart().catch((err) => {
      this.startPromise = null;
      throw err;
    });
    return this.startPromise;
  }

  @preDestroy()
  async stop(): Promise<void> {
    if (!this.server) return;
    const server = this.server;
    await new Promise<void>((resolve) => {
      server.close(() => {
        log.info("PostHog Code internal MCP stopped");
        resolve();
      });
    });
    this.server = null;
    this.port = null;
    this.bearerToken = null;
    this.startPromise = null;
  }

  getUrl(): string {
    if (!this.port) {
      throw new Error("posthog-code-internal MCP server not started");
    }
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  getAuthHeader(): { name: string; value: string } {
    if (!this.bearerToken) {
      throw new Error("posthog-code-internal MCP server not started");
    }
    return { name: "authorization", value: `Bearer ${this.bearerToken}` };
  }

  private async doStart(): Promise<void> {
    this.bearerToken = randomBytes(32).toString("hex");

    const server = http.createServer((req, res) => {
      void this.handleRequest(req, res);
    });
    this.server = server;

    await new Promise<void>((resolve, reject) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (typeof addr === "object" && addr) {
          this.port = addr.port;
          log.info("PostHog Code internal MCP started", { port: this.port });
          resolve();
        } else {
          reject(new Error("Failed to get internal MCP address"));
        }
      });
      server.on("error", (err) => {
        log.error("Internal MCP server error", err);
        reject(err);
      });
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<void> {
    const auth = req.headers.authorization;
    if (!auth || auth !== `Bearer ${this.bearerToken}`) {
      res.writeHead(401).end("Unauthorized");
      return;
    }

    let mcpServer: McpServer | null = null;
    let transport: StreamableHTTPServerTransport | null = null;
    try {
      // Stateless per-request: each HTTP request gets a fresh server +
      // transport. Avoids cross-request session state and matches the SDK's
      // documented stateless pattern.
      mcpServer = this.buildServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      const owned = { mcpServer, transport };
      res.on("close", () => {
        try {
          owned.transport.close();
        } catch {}
        try {
          owned.mcpServer.close();
        } catch {}
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res);
    } catch (err) {
      log.error("Internal MCP request error", err);
      try {
        transport?.close();
      } catch {}
      try {
        mcpServer?.close();
      } catch {}
      if (!res.headersSent) {
        res.writeHead(500).end("Internal error");
      } else {
        res.end();
      }
    }
  }

  private buildServer(): McpServer {
    const server = new McpServer(
      { name: SERVER_NAME, version: SERVER_VERSION },
      { capabilities: { tools: {} } },
    );

    server.tool(
      "read_custom_instructions",
      "Read the user's custom instructions — extra guidance the user has appended to every agent prompt. Returns the raw text (empty string if unset).",
      async () => {
        const text = this.readCustomInstructions();
        return {
          content: [
            {
              type: "text",
              text:
                text === ""
                  ? "(empty — no custom instructions are currently configured)"
                  : text,
            },
          ],
        };
      },
    );

    server.tool(
      "write_custom_instructions",
      "Replace the user's custom instructions. Pass the full new text — this overwrites the existing value. Pass an empty string to clear.",
      { instructions: z.string() },
      async ({ instructions }) => {
        this.writeCustomInstructions(instructions);
        this.emit(PostHogCodeInternalMcpEvent.CustomInstructionsChanged, {
          customInstructions: instructions,
        });
        return {
          content: [{ type: "text", text: "Custom instructions updated." }],
        };
      },
    );

    server.tool(
      "list_mcp_servers",
      "List the MCP server installations available to the agent in the current project. Returns an array with id, name, url, auth_type, and status flags.",
      async () => this.listMcpServers(),
    );

    server.tool(
      "add_mcp_server",
      'Install a new MCP server on the current project. Use auth_type="api_key" to attach a static bearer token (provide api_key); use auth_type="oauth" to start an OAuth flow — the response will include a redirect URL the user must visit.',
      {
        name: z.string().min(1),
        url: z.string().url(),
        auth_type: z.enum(["api_key", "oauth"]).default("api_key"),
        api_key: z.string().optional(),
        description: z.string().optional(),
      },
      async (args) => this.addMcpServer(args),
    );

    return server;
  }

  private readCustomInstructions(): string {
    if (!rendererStore.has(SETTINGS_STORE_KEY)) return "";
    const encrypted = rendererStore.get(SETTINGS_STORE_KEY) as string;
    const raw = decrypt(encrypted);
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw) as {
        state?: { customInstructions?: string };
      };
      return parsed.state?.customInstructions ?? "";
    } catch (err) {
      log.warn("Failed to parse settings-storage", { err });
      return "";
    }
  }

  private writeCustomInstructions(value: string): void {
    let parsed: { state?: Record<string, unknown>; version?: number } = {
      state: {},
      version: 0,
    };
    if (rendererStore.has(SETTINGS_STORE_KEY)) {
      const encrypted = rendererStore.get(SETTINGS_STORE_KEY) as string;
      const raw = decrypt(encrypted);
      if (raw) {
        try {
          parsed = JSON.parse(raw);
        } catch (err) {
          log.warn("Settings store corrupted, overwriting with new state", {
            err,
          });
        }
      }
    }
    parsed.state = { ...(parsed.state ?? {}), customInstructions: value };
    rendererStore.set(SETTINGS_STORE_KEY, encrypt(JSON.stringify(parsed)));
  }

  private async listMcpServers(): Promise<CallToolResult> {
    const { apiHost } = await this.authService.getValidAccessToken();
    const projectId = this.authService.getState().projectId;
    if (!projectId) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No project selected. Sign in and pick a project before listing MCP servers.",
          },
        ],
      };
    }
    const baseUrl = apiHost.replace(/\/+$/, "");
    const url = `${baseUrl}/api/environments/${projectId}/mcp_server_installations/`;
    const response = await this.authService.authenticatedFetch(fetch, url, {
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to list MCP servers (${response.status}): ${errText.slice(0, 500)}`,
          },
        ],
      };
    }
    const data = (await response.json()) as {
      results?: Array<{
        id: string;
        name?: string;
        display_name?: string;
        url?: string;
        auth_type?: string;
        is_enabled?: boolean;
        pending_oauth?: boolean;
        needs_reauth?: boolean;
      }>;
    };
    const servers = (data.results ?? []).map((i) => ({
      id: i.id,
      name: i.name ?? i.display_name ?? "(unnamed)",
      url: i.url ?? "",
      auth_type: i.auth_type ?? "unknown",
      is_enabled: i.is_enabled !== false,
      pending_oauth: !!i.pending_oauth,
      needs_reauth: !!i.needs_reauth,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(servers, null, 2) }],
    };
  }

  private async addMcpServer(input: {
    name: string;
    url: string;
    auth_type: "api_key" | "oauth";
    api_key?: string;
    description?: string;
  }): Promise<CallToolResult> {
    const { apiHost } = await this.authService.getValidAccessToken();
    const projectId = this.authService.getState().projectId;
    if (!projectId) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No project selected. Sign in and pick a project before adding an MCP server.",
          },
        ],
      };
    }
    if (input.auth_type === "api_key" && !input.api_key) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: 'auth_type="api_key" requires the api_key field to be set.',
          },
        ],
      };
    }
    const baseUrl = apiHost.replace(/\/+$/, "");
    const url = `${baseUrl}/api/environments/${projectId}/mcp_server_installations/install_custom/`;
    const response = await this.authService.authenticatedFetch(fetch, url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        url: input.url,
        auth_type: input.auth_type,
        api_key: input.api_key,
        description: input.description,
        install_source: "posthog-code",
      }),
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Failed to install MCP server (${response.status}): ${errText.slice(0, 500)}`,
          },
        ],
      };
    }
    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.redirect_url === "string") {
      return {
        content: [
          {
            type: "text",
            text: `OAuth flow required. The user must visit: ${data.redirect_url} to finish installing "${input.name}". The new server will be available the next time an agent task is started after the OAuth flow completes.`,
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: `Installed MCP server "${input.name}" (id=${String(data.id ?? "unknown")}). It will be available the next time an agent task is started.`,
        },
      ],
    };
  }
}
