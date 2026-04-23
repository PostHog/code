import { delimiter } from "node:path";
import { getLlmGatewayUrl } from "@posthog/agent/posthog-api";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import type { AuthService } from "../auth/service";
import type { AuthProxyService } from "../auth-proxy/service";
import type { McpProxyService } from "../mcp-proxy/service";
import type { Credentials } from "./schemas";

const log = logger.scope("agent-auth-adapter");

export interface AcpMcpServer {
  name: string;
  type: "http";
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export interface AgentPosthogConfig {
  apiUrl: string;
  getApiKey: () => Promise<string>;
  refreshApiKey: () => Promise<string>;
  projectId: number;
}

interface ConfigureProcessEnvInput {
  credentials: Credentials;
  mockNodeDir: string;
  proxyUrl: string;
  claudeCliPath: string;
}

@injectable()
export class AgentAuthAdapter {
  constructor(
    @inject(MAIN_TOKENS.AuthService)
    private readonly authService: AuthService,
    @inject(MAIN_TOKENS.AuthProxyService)
    private readonly authProxy: AuthProxyService,
    @inject(MAIN_TOKENS.McpProxyService)
    private readonly mcpProxy: McpProxyService,
  ) {}

  createPosthogConfig(credentials: Credentials): AgentPosthogConfig {
    return {
      apiUrl: credentials.apiHost,
      getApiKey: () => this.getValidToken(),
      refreshApiKey: () => this.refreshToken(),
      projectId: credentials.projectId,
    };
  }

  async buildMcpServers(credentials: Credentials): Promise<AcpMcpServer[]> {
    const servers: AcpMcpServer[] = [];
    const mcpUrl = this.getPostHogMcpUrl(credentials.apiHost);
    // Warm the token so authenticatedFetch() has something cached, but do not
    // bake it into the MCP config — the proxy injects a fresh one on every
    // forwarded request.
    await this.getValidToken();

    await this.mcpProxy.start();
    const proxiedPosthogUrl = this.mcpProxy.register("posthog", mcpUrl);

    servers.push({
      name: "posthog",
      type: "http",
      url: proxiedPosthogUrl,
      headers: [
        {
          name: "x-posthog-project-id",
          value: String(credentials.projectId),
        },
        { name: "x-posthog-mcp-version", value: "2" },
      ],
    });

    const installations = await this.fetchMcpInstallations(credentials);

    for (const installation of installations) {
      if (installation.url === mcpUrl) continue;

      const name =
        installation.name || installation.display_name || installation.url;

      if (installation.auth_type === "none") {
        servers.push({
          name,
          type: "http",
          url: installation.url,
          headers: [],
        });
        continue;
      }

      const proxiedUrl = this.mcpProxy.register(
        `installation-${installation.id}`,
        installation.proxy_url,
      );
      servers.push({
        name,
        type: "http",
        url: proxiedUrl,
        headers: [],
      });
    }

    return servers;
  }

  async ensureGatewayProxy(apiHost: string): Promise<string> {
    return this.authProxy.start(getLlmGatewayUrl(apiHost));
  }

  async configureProcessEnv({
    credentials,
    mockNodeDir,
    proxyUrl,
    claudeCliPath,
  }: ConfigureProcessEnvInput): Promise<void> {
    await this.getValidToken();

    const currentPath = process.env.PATH || "";
    if (!currentPath.split(delimiter).includes(mockNodeDir)) {
      process.env.PATH = `${mockNodeDir}${delimiter}${currentPath}`;
    }

    process.env.LLM_GATEWAY_URL = proxyUrl;
    process.env.CLAUDE_CODE_EXECUTABLE = claudeCliPath;
    process.env.POSTHOG_API_URL = credentials.apiHost;
    process.env.POSTHOG_PROJECT_ID = String(credentials.projectId);
  }

  private syncTokenEnvironment(token: string): void {
    process.env.POSTHOG_API_KEY = token;
    process.env.POSTHOG_AUTH_HEADER = `Bearer ${token}`;
  }

  private async getValidToken(): Promise<string> {
    const { accessToken } = await this.authService.getValidAccessToken();
    this.syncTokenEnvironment(accessToken);
    return accessToken;
  }

  private async refreshToken(): Promise<string> {
    const { accessToken } = await this.authService.refreshAccessToken();
    this.syncTokenEnvironment(accessToken);
    return accessToken;
  }

  private getPostHogMcpUrl(apiHost: string): string {
    const overrideUrl = process.env.POSTHOG_MCP_URL;
    if (overrideUrl) {
      return overrideUrl;
    }
    if (apiHost.includes("localhost") || apiHost.includes("127.0.0.1")) {
      return "http://localhost:8787/mcp";
    }
    return "https://mcp.posthog.com/mcp";
  }

  private getPostHogApiBaseUrl(apiHost: string): string {
    const host = process.env.POSTHOG_PROXY_BASE_URL || apiHost;
    return host.endsWith("/") ? host.slice(0, -1) : host;
  }

  private async fetchMcpInstallations(credentials: Credentials): Promise<
    Array<{
      id: string;
      url: string;
      proxy_url: string;
      name: string;
      display_name: string;
      auth_type: string;
    }>
  > {
    const baseUrl = this.getPostHogApiBaseUrl(credentials.apiHost);
    const url = `${baseUrl}/api/environments/${credentials.projectId}/mcp_server_installations/`;

    try {
      const response = await this.authService.authenticatedFetch(fetch, url, {
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        log.warn("Failed to fetch MCP installations", {
          status: response.status,
        });
        return [];
      }

      const data = (await response.json()) as {
        results?: Array<{
          id: string;
          url: string;
          proxy_url?: string;
          name: string;
          display_name: string;
          auth_type: string;
          is_enabled?: boolean;
          pending_oauth: boolean;
          needs_reauth: boolean;
        }>;
      };
      const installations = data.results ?? [];

      return installations
        .filter(
          (i) => !i.pending_oauth && !i.needs_reauth && i.is_enabled !== false,
        )
        .map((i) => ({
          ...i,
          proxy_url:
            i.proxy_url ??
            `${baseUrl}/api/environments/${credentials.projectId}/mcp_server_installations/${i.id}/proxy/`,
        }));
    } catch (err) {
      log.warn("Error fetching MCP installations", { error: err });
      return [];
    }
  }
}
