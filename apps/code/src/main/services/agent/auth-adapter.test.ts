import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("../../utils/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("@posthog/agent/posthog-api", () => ({
  getLlmGatewayUrl: vi.fn(() => "https://gateway.example.com"),
}));

vi.stubGlobal("fetch", mockFetch);

import { AgentAuthAdapter } from "./auth-adapter";

const baseCredentials = {
  apiHost: "https://app.posthog.com",
  projectId: 1,
};

function createDependencies() {
  return {
    authService: {
      getValidAccessToken: vi.fn().mockResolvedValue({
        accessToken: "test-access-token",
        apiHost: "https://app.posthog.com",
      }),
      refreshAccessToken: vi.fn().mockResolvedValue({
        accessToken: "fresh-access-token",
        apiHost: "https://app.posthog.com",
      }),
      authenticatedFetch: vi
        .fn()
        .mockImplementation(
          async (
            fetchImpl: typeof fetch,
            input: string | Request,
            init?: RequestInit,
          ) => fetchImpl(input, init),
        ),
    },
    authProxy: {
      start: vi.fn().mockResolvedValue("http://127.0.0.1:9999"),
    },
  };
}

describe("AgentAuthAdapter", () => {
  let adapter: AgentAuthAdapter;
  let deps: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    deps = createDependencies();
    adapter = new AgentAuthAdapter(
      deps.authService as never,
      deps.authProxy as never,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the default PostHog MCP server", async () => {
    const servers = await adapter.buildMcpServers(baseCredentials);

    expect(servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "posthog",
          type: "http",
          url: "https://mcp.posthog.com/mcp",
          headers: expect.arrayContaining([
            {
              name: "Authorization",
              value: "Bearer test-access-token",
            },
          ]),
        }),
      ]),
    );
  });

  it("includes enabled user-installed MCP servers from backend", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: "inst-1",
              url: "https://custom-mcp.example.com",
              proxy_url: "https://proxy.posthog.com/inst-1/",
              name: "custom-server",
              display_name: "Custom Server",
              auth_type: "none",
              is_enabled: true,
              pending_oauth: false,
              needs_reauth: false,
            },
          ],
        }),
    });

    const servers = await adapter.buildMcpServers(baseCredentials);

    expect(servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "custom-server",
          url: "https://custom-mcp.example.com",
          headers: [],
        }),
      ]),
    );
  });

  it("routes authenticated installed MCP servers through the proxy URL", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: "inst-2",
              url: "https://remote-mcp.example.com",
              proxy_url: "https://proxy.posthog.com/inst-2/",
              name: "secure-server",
              display_name: "Secure Server",
              auth_type: "oauth",
              is_enabled: true,
              pending_oauth: false,
              needs_reauth: false,
            },
          ],
        }),
    });

    const servers = await adapter.buildMcpServers(baseCredentials);

    expect(servers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "secure-server",
          url: "https://proxy.posthog.com/inst-2/",
          headers: [
            { name: "Authorization", value: "Bearer test-access-token" },
          ],
        }),
      ]),
    );
  });

  it("configures environment using the gateway proxy and current token", async () => {
    await adapter.configureProcessEnv({
      credentials: baseCredentials,
      mockNodeDir: "/mock/node",
      proxyUrl: "http://127.0.0.1:9999",
      claudeCliPath: "/mock/claude-cli.js",
    });

    expect(process.env.POSTHOG_API_KEY).toBe("test-access-token");
    expect(process.env.POSTHOG_AUTH_HEADER).toBe("Bearer test-access-token");
    expect(process.env.LLM_GATEWAY_URL).toBe("http://127.0.0.1:9999");
    expect(process.env.CLAUDE_CODE_EXECUTABLE).toBe("/mock/claude-cli.js");
    expect(process.env.POSTHOG_PROJECT_ID).toBe("1");
  });
});
