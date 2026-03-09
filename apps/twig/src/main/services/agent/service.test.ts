import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("electron", () => ({
  app: {
    getAppPath: () => "/mock/appPath",
    isPackaged: false,
    getVersion: () => "0.0.0-test",
    getPath: () => "/mock/home",
  },
}));

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

vi.mock("../../utils/typed-event-emitter.js", () => ({
  TypedEventEmitter: class {
    emit = vi.fn();
    on = vi.fn();
    off = vi.fn();
  },
}));

vi.stubGlobal("fetch", mockFetch);

import { AgentService } from "./service.js";

interface TestableAgentService {
  buildMcpServers(credentials: {
    apiKey: string;
    apiHost: string;
    projectId: number;
  }): Promise<
    Array<{
      name: string;
      type: string;
      url: string;
      headers: Array<{ name: string; value: string }>;
    }>
  >;
}

const credentials = {
  apiKey: "test-api-key",
  apiHost: "https://app.posthog.com",
  projectId: 1,
};

describe("AgentService", () => {
  let service: TestableAgentService;

  beforeEach(() => {
    vi.clearAllMocks();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    service = new AgentService(
      {
        register: vi.fn(),
        unregister: vi.fn(),
        killByTaskId: vi.fn(),
      } as never,
      { acquire: vi.fn(), release: vi.fn() } as never,
      { readRepoFile: vi.fn(), writeRepoFile: vi.fn() } as never,
      { getPluginPath: vi.fn(() => "/mock/plugin") } as never,
    ) as unknown as TestableAgentService;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("buildMcpServers", () => {
    it("includes posthog MCP server with auth headers", async () => {
      const servers = await service.buildMcpServers(credentials);

      expect(servers).toEqual([
        {
          name: "posthog",
          type: "http",
          url: "https://mcp.posthog.com/mcp",
          headers: [
            { name: "Authorization", value: "Bearer test-api-key" },
            { name: "x-posthog-project-id", value: "1" },
            { name: "x-posthog-mcp-version", value: "2" },
          ],
        },
      ]);
    });

    it("includes user-installed MCP servers (no auth)", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: "inst-1",
                url: "https://custom.example.com/mcp",
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

      const servers = await service.buildMcpServers(credentials);

      expect(servers).toHaveLength(2);
      expect(servers[1]).toEqual({
        name: "custom-server",
        type: "http",
        url: "https://custom.example.com/mcp",
        headers: [],
      });
    });

    it("routes authenticated servers through proxy", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: "inst-2",
                url: "https://authed.example.com/mcp",
                proxy_url: "https://proxy.posthog.com/inst-2/",
                name: "authed-server",
                display_name: "Authed Server",
                auth_type: "oauth2",
                is_enabled: true,
                pending_oauth: false,
                needs_reauth: false,
              },
            ],
          }),
      });

      const servers = await service.buildMcpServers(credentials);

      expect(servers[1]).toEqual({
        name: "authed-server",
        type: "http",
        url: "https://proxy.posthog.com/inst-2/",
        headers: [{ name: "Authorization", value: "Bearer test-api-key" }],
      });
    });

    it("skips disabled and pending-auth installations", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            results: [
              {
                id: "disabled",
                url: "https://disabled.example.com",
                name: "disabled",
                display_name: "Disabled",
                auth_type: "none",
                is_enabled: false,
                pending_oauth: false,
                needs_reauth: false,
              },
              {
                id: "pending",
                url: "https://pending.example.com",
                name: "pending",
                display_name: "Pending",
                auth_type: "oauth2",
                is_enabled: true,
                pending_oauth: true,
                needs_reauth: false,
              },
              {
                id: "reauth",
                url: "https://reauth.example.com",
                name: "reauth",
                display_name: "Reauth",
                auth_type: "oauth2",
                is_enabled: true,
                pending_oauth: false,
                needs_reauth: true,
              },
            ],
          }),
      });

      const servers = await service.buildMcpServers(credentials);

      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("posthog");
    });

    it("returns only posthog server when installations fetch fails", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      const servers = await service.buildMcpServers(credentials);

      expect(servers).toHaveLength(1);
      expect(servers[0].name).toBe("posthog");
    });
  });
});
