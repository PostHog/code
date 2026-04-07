import jwt from "jsonwebtoken";
import { type SetupServerApi, setupServer } from "msw/node";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { createTestRepo, type TestRepo } from "../test/fixtures/api";
import { createPostHogHandlers } from "../test/mocks/msw-handlers";
import type { TaskRun } from "../types";
import { AgentServer } from "./agent-server";
import { type JwtPayload, SANDBOX_CONNECTION_AUDIENCE } from "./jwt";

interface TestableServer {
  getInitialPromptOverride(run: TaskRun): string | null;
  detectAndAttachPrUrl(payload: unknown, update: unknown): void;
  detectedPrUrl: string | null;
  buildCloudSystemPrompt(prUrl?: string | null): string;
}

// The Claude Agent SDK has an internal readMessages() loop that rejects with
// "Query closed before response received" during cleanup. The SDK starts this
// promise in the constructor without a .catch() handler, so the rejection is
// unhandled. We suppress it here to prevent vitest from failing the suite.
type Listener = (...args: unknown[]) => void;
const originalListeners: Listener[] = [];

beforeAll(() => {
  originalListeners.push(
    ...process.rawListeners("unhandledRejection").map((l) => l as Listener),
  );
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", (reason: unknown) => {
    if (
      reason instanceof Error &&
      reason.message === "Query closed before response received"
    ) {
      return;
    }
    for (const listener of originalListeners) {
      listener(reason);
    }
  });
});

afterAll(() => {
  process.removeAllListeners("unhandledRejection");
  for (const listener of originalListeners) {
    process.on("unhandledRejection", listener);
  }
});

function createTestJwt(
  payload: JwtPayload,
  privateKey: string,
  expiresInSeconds = 3600,
): string {
  return jwt.sign(
    { ...payload, aud: SANDBOX_CONNECTION_AUDIENCE },
    privateKey,
    {
      algorithm: "RS256",
      expiresIn: expiresInSeconds,
    },
  );
}

// Test RSA key pair (2048-bit, for testing only)
const TEST_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDqh94SYMFsvG4C
Co9BSGjtPr2/OxzuNGr41O4+AMkDQRd9pKO49DhTA4VzwnOvrH8y4eI9N8OQne7B
wpdoouSn4DoDAS/b3SUfij/RoFUSyZiTQoWz0H6o2Vuufiz0Hf+BzlZEVnhSQ1ru
vqSf+4l8cWgeMXaFXgdD5kQ8GjvR5uqKxvO2Env1hMJRKeOOEGgCep/0c6SkMUTX
SeC+VjypVg9+8yPxtIpOQ7XKv+7e/PA0ilqehRQh4fo9BAWjUW1+HnbtsjJAjjfv
ngzIjpajuQVyMi7G79v8OvijhLMJjJBh3TdbVIfi+RkVj/H94UUfKWRfJA0eLykA
VvTiFf0nAgMBAAECggEABkLBQWFW2IXBNAm/IEGEF408uH2l/I/mqSTaBUq1EwKq
U17RRg8y77hg2CHBP9fNf3i7NuIltNcaeA6vRwpOK1MXiVv/QJHLO2fP41Mx4jIC
gi/c7NtsfiprQaG5pnykhP0SnXlndd65bzUkpOasmWdXnbK5VL8ZV40uliInJafE
1Eo9qSYCJxHmivU/4AbiBgygOAo1QIiuuUHcx0YGknLrBaMQETuvWJGE3lxVQ30/
EuRyA3r6BwN2T0z47PZBzvCpg/C1KeoYuKSMwMyEXfl+a8NclqdROkVaenmZpvVH
0lAvFDuPrBSDmU4XJbKCEfwfHjRkiWAFaTrKntGQtQKBgQD/ILoK4U9DkJoKTYvY
9lX7dg6wNO8jGLHNufU8tHhU+QnBMH3hBXrAtIKQ1sGs+D5rq/O7o0Balmct9vwb
CQZ1EpPfa83Thsv6Skd7lWK0JF7g2vVk8kT4nY/eqkgZUWgkfdMp+OMg2drYiIE8
u+sRPTCdq4Tv5miRg0OToX2H/QKBgQDrVR2GXm6ZUyFbCy8A0kttXP1YyXqDVq7p
L4kqyUq43hmbjzIRM4YDN3EvgZvVf6eub6L/3HfKvWD/OvEhHovTvHb9jkwZ3FO+
YQllB/ccAWJs/Dw5jLAsX9O+eIe4lfwROib3vYLnDTAmrXD5VL35R5F0MsdRoxk5
lTCq1sYI8wKBgGA9ZjDIgXAJUjJkwkZb1l9/T1clALiKjjf+2AXIRkQ3lXhs5G9H
8+BRt5cPjAvFsTZIrS6xDIufhNiP/NXt96OeGG4FaqVKihOmhYSW+57cwXWs4zjr
Mx1dwnHKZlw2m0R4unlwy60OwUFBbQ8ODER6gqZXl1Qv5G5Px+Qe3Q25AoGAUl+s
wgfz9r9egZvcjBEQTeuq0pVTyP1ipET7YnqrKSK1G/p3sAW09xNFDzfy8DyK2UhC
agUl+VVoym47UTh8AVWK4R4aDUNOHOmifDbZjHf/l96CxjI0yJOSbq2J9FarsOwG
D9nKJE49eIxlayD6jnM6us27bxwEDF/odSRQlXkCgYEAxn9l/5kewWkeEA0Afe1c
Uf+mepHBLw1Pbg5GJYIZPC6e5+wRNvtFjM5J6h5LVhyb7AjKeLBTeohoBKEfUyUO
rl/ql9qDIh5lJFn3uNh7+r7tmG21Zl2pyh+O8GljjZ25mYhdiwl0uqzVZaINe2Wa
vbMnD1ZQKgL8LHgb02cbTsc=
-----END PRIVATE KEY-----`;

const TEST_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA6ofeEmDBbLxuAgqPQUho
7T69vzsc7jRq+NTuPgDJA0EXfaSjuPQ4UwOFc8Jzr6x/MuHiPTfDkJ3uwcKXaKLk
p+A6AwEv290lH4o/0aBVEsmYk0KFs9B+qNlbrn4s9B3/gc5WRFZ4UkNa7r6kn/uJ
fHFoHjF2hV4HQ+ZEPBo70ebqisbzthJ79YTCUSnjjhBoAnqf9HOkpDFE10ngvlY8
qVYPfvMj8bSKTkO1yr/u3vzwNIpanoUUIeH6PQQFo1Ftfh527bIyQI43754MyI6W
o7kFcjIuxu/b/Dr4o4SzCYyQYd03W1SH4vkZFY/x/eFFHylkXyQNHi8pAFb04hX9
JwIDAQAB
-----END PUBLIC KEY-----`;

describe("AgentServer HTTP Mode", () => {
  let repo: TestRepo;
  let server: AgentServer;
  let mswServer: SetupServerApi;
  let appendLogCalls: unknown[][];
  const port = 3099;

  beforeEach(async () => {
    repo = await createTestRepo("agent-server-http");
    appendLogCalls = [];
    mswServer = setupServer(
      ...createPostHogHandlers({
        baseUrl: "http://localhost:8000",
        onAppendLog: (entries) => appendLogCalls.push(entries),
      }),
    );
    mswServer.listen({ onUnhandledRequest: "bypass" });
  });

  afterEach(async () => {
    if (server) {
      await server.stop();
    }
    mswServer.close();
    await repo.cleanup();
  });

  const createServer = () => {
    server = new AgentServer({
      port,
      jwtPublicKey: TEST_PUBLIC_KEY,
      repositoryPath: repo.path,
      apiUrl: "http://localhost:8000",
      apiKey: "test-api-key",
      projectId: 1,
      mode: "interactive",
      taskId: "test-task-id",
      runId: "test-run-id",
    });
    return server;
  };

  const createToken = (overrides = {}) => {
    return createTestJwt(
      {
        run_id: "test-run-id",
        task_id: "test-task-id",
        team_id: 1,
        user_id: 1,
        distinct_id: "test-distinct-id",
        mode: "interactive",
        ...overrides,
      },
      TEST_PRIVATE_KEY,
    );
  };

  describe("GET /health", () => {
    it("returns ok status with active session", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/health`);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body).toEqual({ status: "ok", hasSession: true });
    });
  });

  describe("GET /events", () => {
    it("returns 401 without authorization header", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/events`);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Missing authorization header");
    });

    it("returns 401 with invalid token", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/events`, {
        headers: { Authorization: "Bearer invalid-token" },
      });
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.code).toBe("invalid_signature");
    });

    it("accepts valid JWT and returns SSE stream", async () => {
      await createServer().start();
      const token = createToken();

      const response = await fetch(`http://localhost:${port}/events`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/event-stream");
    });
  });

  describe("POST /command", () => {
    it("returns 401 without authorization", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "user_message",
          params: { content: "test" },
        }),
      });

      expect(response.status).toBe(401);
    });

    it("returns 400 when run_id does not match active session", async () => {
      await createServer().start();
      const token = createToken({ run_id: "different-run-id" });

      const response = await fetch(`http://localhost:${port}/command`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "user_message",
          params: { content: "test" },
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("No active session for this run");
    });

    it("accepts structured user_message content", async () => {
      await createServer().start();
      const token = createToken({ run_id: "different-run-id" });

      const response = await fetch(`http://localhost:${port}/command`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "user_message",
          params: {
            content: [{ type: "text", text: "test" }],
          },
        }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe("No active session for this run");
    });
  });

  describe("404 handling", () => {
    it("returns 404 for unknown routes", async () => {
      await createServer().start();

      const response = await fetch(`http://localhost:${port}/unknown`);
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.error).toBe("Not found");
    });
  });

  describe("getInitialPromptOverride", () => {
    it("returns override string from run state", () => {
      const s = createServer();
      const run = {
        state: { initial_prompt_override: "do something else" },
      } as unknown as TaskRun;
      const result = (s as unknown as TestableServer).getInitialPromptOverride(
        run,
      );
      expect(result).toBe("do something else");
    });

    it("returns null when override is absent", () => {
      const s = createServer();
      const run = { state: {} } as unknown as TaskRun;
      const result = (s as unknown as TestableServer).getInitialPromptOverride(
        run,
      );
      expect(result).toBeNull();
    });

    it("returns null for whitespace-only override", () => {
      const s = createServer();
      const run = {
        state: { initial_prompt_override: "  " },
      } as unknown as TaskRun;
      const result = (s as unknown as TestableServer).getInitialPromptOverride(
        run,
      );
      expect(result).toBeNull();
    });

    it("returns null for non-string override", () => {
      const s = createServer();
      const run = {
        state: { initial_prompt_override: 42 },
      } as unknown as TaskRun;
      const result = (s as unknown as TestableServer).getInitialPromptOverride(
        run,
      );
      expect(result).toBeNull();
    });
  });

  describe("detectedPrUrl tracking", () => {
    it("stores PR URL when detectAndAttachPrUrl finds a match", () => {
      const s = createServer();
      const payload = {
        task_id: "test-task-id",
        run_id: "test-run-id",
      };
      const update = {
        _meta: {
          claudeCode: {
            toolName: "Bash",
            toolResponse: {
              stdout:
                "https://github.com/PostHog/posthog/pull/42\nCreating pull request...",
            },
          },
        },
      };

      (s as unknown as TestableServer).detectAndAttachPrUrl(payload, update);
      expect((s as unknown as TestableServer).detectedPrUrl).toBe(
        "https://github.com/PostHog/posthog/pull/42",
      );
    });

    it("does not set detectedPrUrl when no PR URL is found", () => {
      const s = createServer();
      const payload = {
        task_id: "test-task-id",
        run_id: "test-run-id",
      };
      const update = {
        _meta: {
          claudeCode: {
            toolName: "Bash",
            toolResponse: { stdout: "just some output" },
          },
        },
      };

      (s as unknown as TestableServer).detectAndAttachPrUrl(payload, update);
      expect((s as unknown as TestableServer).detectedPrUrl).toBeNull();
    });
  });

  describe("buildCloudSystemPrompt", () => {
    it("returns PR-aware prompt when prUrl is provided", () => {
      const s = createServer();
      const prompt = (s as unknown as TestableServer).buildCloudSystemPrompt(
        "https://github.com/org/repo/pull/1",
      );
      expect(prompt).toContain("Do NOT create a new branch");
      expect(prompt).toContain("https://github.com/org/repo/pull/1");
      expect(prompt).toContain("gh pr checkout");
      expect(prompt).not.toContain("Create a draft pull request");
      expect(prompt).toContain("Generated-By: PostHog Code");
      expect(prompt).toContain("Task-Id: test-task-id");
    });

    it("returns default prompt when no prUrl", () => {
      const s = createServer();
      const prompt = (s as unknown as TestableServer).buildCloudSystemPrompt();
      expect(prompt).toContain("posthog-code/");
      expect(prompt).toContain("Create a draft pull request");
      expect(prompt).toContain("gh pr create --draft");
      expect(prompt).toContain("Generated-By: PostHog Code");
      expect(prompt).toContain("Task-Id: test-task-id");
      expect(prompt).toContain("Created with [PostHog Code]");
    });

    it("returns default prompt when prUrl is null", () => {
      const s = createServer();
      const prompt = (s as unknown as TestableServer).buildCloudSystemPrompt(
        null,
      );
      expect(prompt).toContain("posthog-code/");
      expect(prompt).toContain("Create a draft pull request");
      expect(prompt).toContain("gh pr create --draft");
    });

    it("includes --base flag when baseBranch is configured", () => {
      server = new AgentServer({
        port,
        jwtPublicKey: TEST_PUBLIC_KEY,
        repositoryPath: repo.path,
        apiUrl: "http://localhost:8000",
        apiKey: "test-api-key",
        projectId: 1,
        mode: "interactive",
        taskId: "test-task-id",
        runId: "test-run-id",
        baseBranch: "add-yolo-to-readme",
      });
      const prompt = (
        server as unknown as TestableServer
      ).buildCloudSystemPrompt();
      expect(prompt).toContain(
        "gh pr create --draft --base add-yolo-to-readme",
      );
    });

    it("omits --base flag when baseBranch is not configured", () => {
      const s = createServer();
      const prompt = (s as unknown as TestableServer).buildCloudSystemPrompt();
      expect(prompt).toContain("gh pr create --draft`");
      expect(prompt).not.toContain("--base");
    });
  });
});
