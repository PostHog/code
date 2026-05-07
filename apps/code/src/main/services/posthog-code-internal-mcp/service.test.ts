import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// electron-store mkdir's userDataDir at import time, which fails in CI where
// the default mocked path (/mock/userData) isn't writable. The tests below
// don't exercise the store paths, so a no-op mock is safe.
vi.mock("../../utils/store", () => ({
  rendererStore: {
    has: () => false,
    get: () => undefined,
    set: () => {},
  },
}));

import { PostHogCodeInternalMcpEvent } from "./schemas";
import { PostHogCodeInternalMcpService } from "./service";

interface FakeAuthService {
  getValidAccessToken: () => Promise<{ apiHost: string; token: string }>;
  getState: () => { projectId: number };
  authenticatedFetch: (
    fetchImpl: typeof fetch,
    url: string,
    init?: RequestInit,
  ) => Promise<Response>;
}

const createFakeAuth = (
  fetchImpl: (url: string) => Promise<Response>,
): FakeAuthService => ({
  getValidAccessToken: async () => ({
    apiHost: "https://example.com",
    token: "t",
  }),
  getState: () => ({ projectId: 1 }),
  authenticatedFetch: async (_f, url) => fetchImpl(String(url)),
});

const okJson = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("PostHogCodeInternalMcpService.pollForOauthCompletion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("emits McpServerInstalled when pending_oauth flips to false", async () => {
    const responses = [
      okJson({
        results: [
          { id: "abc", name: "linear", pending_oauth: true, is_enabled: true },
        ],
      }),
      okJson({
        results: [
          { id: "abc", name: "linear", pending_oauth: false, is_enabled: true },
        ],
      }),
    ];
    const auth = createFakeAuth(async () => {
      const next = responses.shift();
      if (!next) throw new Error("no more responses");
      return next;
    });
    const service = new PostHogCodeInternalMcpService(auth as never);
    const handler = vi.fn();
    service.on(PostHogCodeInternalMcpEvent.McpServerInstalled, handler);

    const poll = (
      service as unknown as {
        pollForOauthCompletion: (id: string, name: string) => Promise<void>;
      }
    ).pollForOauthCompletion("abc", "linear");

    await vi.advanceTimersByTimeAsync(3500);
    await vi.advanceTimersByTimeAsync(3500);
    await poll;

    expect(handler).toHaveBeenCalledOnce();
  });

  it("stops polling when installation disappears", async () => {
    const auth = createFakeAuth(async () => okJson({ results: [] }));
    const service = new PostHogCodeInternalMcpService(auth as never);
    const handler = vi.fn();
    service.on(PostHogCodeInternalMcpEvent.McpServerInstalled, handler);

    const poll = (
      service as unknown as {
        pollForOauthCompletion: (id: string, name: string) => Promise<void>;
      }
    ).pollForOauthCompletion("abc", "linear");

    await vi.advanceTimersByTimeAsync(3500);
    await poll;

    expect(handler).not.toHaveBeenCalled();
  });
});
