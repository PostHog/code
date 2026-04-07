import { type SetupServerApi, setupServer } from "msw/node";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PostHogAPIClient } from "../posthog-api";
import { createTestRepo, type TestRepo } from "../test/fixtures/api";
import { createPostHogHandlers } from "../test/mocks/msw-handlers";
import type { Task, TaskRun } from "../types";
import { AgentServer } from "./agent-server";

interface TestableAgentServer {
  posthogAPI: PostHogAPIClient;
  isQuestionMeta: (value: unknown) => boolean;
  getFirstQuestionMeta: (meta: unknown) => unknown;
  relaySlackQuestion: (payload: Record<string, unknown>, meta: unknown) => void;
  createCloudClient: (payload: Record<string, unknown>) => {
    requestPermission: (opts: {
      options: unknown[];
      toolCall: unknown;
    }) => Promise<{
      outcome: { outcome: string };
      _meta?: { message?: string };
    }>;
  };
  questionRelayedToSlack: boolean;
  session: unknown;
  relayAgentResponse: (payload: Record<string, unknown>) => Promise<void>;
  sendInitialTaskMessage: (payload: Record<string, unknown>) => Promise<void>;
}

const TEST_PAYLOAD = {
  run_id: "test-run-id",
  task_id: "test-task-id",
  team_id: 1,
  user_id: 1,
  distinct_id: "test-distinct-id",
  mode: "interactive" as const,
};

const QUESTION_META = {
  codeToolKind: "question",
  questions: [
    {
      question: "Which license should I use?",
      options: [
        { label: "MIT", description: "Permissive license" },
        { label: "Apache 2.0", description: "Patent grant included" },
        { label: "GPL v3", description: "Copyleft license" },
      ],
    },
  ],
};

describe("Question relay", () => {
  let repo: TestRepo;
  let server: TestableAgentServer;
  let mswServer: SetupServerApi;
  const port = 3098;

  beforeEach(async () => {
    repo = await createTestRepo("question-relay");
    mswServer = setupServer(
      ...createPostHogHandlers({ baseUrl: "http://localhost:8000" }),
    );
    mswServer.listen({ onUnhandledRequest: "bypass" });

    server = new AgentServer({
      port,
      jwtPublicKey: "unused-in-unit-tests",
      repositoryPath: repo.path,
      apiUrl: "http://localhost:8000",
      apiKey: "test-api-key",
      projectId: 1,
      mode: "interactive",
      taskId: "test-task-id",
      runId: "test-run-id",
    }) as unknown as TestableAgentServer;
  });

  afterEach(async () => {
    mswServer.close();
    await repo.cleanup();
  });

  describe("isQuestionMeta", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["number", 42],
      ["string", "not a question"],
      ["object without question field", { options: [] }],
      ["object with non-string question", { question: 123 }],
      ["object with non-array options", { question: "Q?", options: "bad" }],
      [
        "object with invalid option items",
        { question: "Q?", options: [{ notLabel: "x" }] },
      ],
    ])("rejects %s", (_label, value) => {
      expect(server.isQuestionMeta(value)).toBe(false);
    });

    it.each([
      [
        "question with options",
        {
          question: "Pick one",
          options: [{ label: "A", description: "desc" }, { label: "B" }],
        },
      ],
      ["question without options", { question: "What do you think?" }],
      ["question with empty options", { question: "Confirm?", options: [] }],
    ])("accepts %s", (_label, value) => {
      expect(server.isQuestionMeta(value)).toBe(true);
    });
  });

  describe("getFirstQuestionMeta", () => {
    it.each([
      ["null meta", null],
      ["undefined meta", undefined],
      ["meta without questions", { other: "field" }],
      ["meta with empty questions array", { questions: [] }],
      ["meta with non-array questions", { questions: "not-array" }],
    ])("returns null for %s", (_label, meta) => {
      expect(server.getFirstQuestionMeta(meta)).toBeNull();
    });

    it("returns first question from valid meta", () => {
      const result = server.getFirstQuestionMeta(QUESTION_META);
      expect(result).toEqual(QUESTION_META.questions[0]);
    });
  });

  describe("relaySlackQuestion", () => {
    it("relays formatted question with options via posthogAPI", () => {
      const relaySpy = vi
        .spyOn(server.posthogAPI, "relayMessage")
        .mockResolvedValue(undefined);

      server.relaySlackQuestion(TEST_PAYLOAD, QUESTION_META);

      expect(relaySpy).toHaveBeenCalledOnce();
      const [taskId, runId, message] = relaySpy.mock.calls[0];
      expect(taskId).toBe("test-task-id");
      expect(runId).toBe("test-run-id");
      expect(message).toContain("*Which license should I use?*");
      expect(message).toContain("1. *MIT*");
      expect(message).toContain("Permissive license");
      expect(message).toContain("2. *Apache 2.0*");
      expect(message).toContain("3. *GPL v3*");
      expect(message).toContain("Reply in this thread");
    });

    it("sets questionRelayedToSlack flag", () => {
      vi.spyOn(server.posthogAPI, "relayMessage").mockResolvedValue(undefined);

      server.relaySlackQuestion(TEST_PAYLOAD, QUESTION_META);
      expect(server.questionRelayedToSlack).toBe(true);
    });

    it("does not relay when meta has no valid question", () => {
      const relaySpy = vi
        .spyOn(server.posthogAPI, "relayMessage")
        .mockResolvedValue(undefined);

      server.relaySlackQuestion(TEST_PAYLOAD, { codeToolKind: "question" });
      expect(server.questionRelayedToSlack).toBe(false);
      expect(relaySpy).not.toHaveBeenCalled();
    });
  });

  describe("createCloudClient requestPermission", () => {
    const ALLOW_OPTIONS = [
      { kind: "allow_once", optionId: "allow", name: "Allow" },
    ];

    describe("with CODE_INTERACTION_ORIGIN=slack", () => {
      beforeEach(() => {
        process.env.CODE_INTERACTION_ORIGIN = "slack";
      });

      afterEach(() => {
        delete process.env.CODE_INTERACTION_ORIGIN;
      });

      it("returns cancelled with relay message for question tool", async () => {
        vi.spyOn(server.posthogAPI, "relayMessage").mockResolvedValue(
          undefined,
        );
        const client = server.createCloudClient(TEST_PAYLOAD);

        const result = await client.requestPermission({
          options: ALLOW_OPTIONS,
          toolCall: { _meta: QUESTION_META },
        });

        expect(result.outcome.outcome).toBe("cancelled");
        expect(result._meta?.message).toContain("relayed to the Slack thread");
        expect(result._meta?.message).toContain("Do NOT re-ask the question");
      });

      it("auto-approves non-question tools", async () => {
        const client = server.createCloudClient(TEST_PAYLOAD);

        const result = await client.requestPermission({
          options: ALLOW_OPTIONS,
          toolCall: { _meta: { codeToolKind: "bash" } },
        });

        expect(result.outcome.outcome).toBe("selected");
      });

      it("auto-approves tools without meta", async () => {
        const client = server.createCloudClient(TEST_PAYLOAD);

        const result = await client.requestPermission({
          options: ALLOW_OPTIONS,
          toolCall: { _meta: null },
        });

        expect(result.outcome.outcome).toBe("selected");
      });
    });

    describe("without CODE_INTERACTION_ORIGIN", () => {
      beforeEach(() => {
        delete process.env.CODE_INTERACTION_ORIGIN;
      });

      it("auto-approves question tools (no Slack relay)", async () => {
        const client = server.createCloudClient(TEST_PAYLOAD);

        const result = await client.requestPermission({
          options: ALLOW_OPTIONS,
          toolCall: { _meta: QUESTION_META },
        });

        expect(result.outcome.outcome).toBe("selected");
      });

      it("keeps auto-approving permissions after SSE send failures", async () => {
        const appendRawLine = vi.fn();
        const brokenSseController = {
          send: vi.fn(() => {
            throw new Error("stream closed");
          }),
          close: vi.fn(),
        };

        const cloudPermissionServer = server as TestableAgentServer & {
          emitConsoleLog: (
            level: "debug" | "info" | "warn" | "error",
            scope: string,
            message: string,
            data?: unknown,
          ) => void;
          logger: { debug: (message: string, data?: unknown) => void };
          session: {
            payload: typeof TEST_PAYLOAD;
            sseController: typeof brokenSseController | null;
            logWriter: {
              appendRawLine: (runId: string, line: string) => void;
            };
          };
        };

        cloudPermissionServer.session = {
          payload: TEST_PAYLOAD,
          sseController: brokenSseController,
          logWriter: {
            appendRawLine,
          },
        };
        cloudPermissionServer.logger = {
          debug: (message: string, data?: unknown) => {
            cloudPermissionServer.emitConsoleLog(
              "debug",
              "agent",
              message,
              data,
            );
          },
        };

        const client = cloudPermissionServer.createCloudClient(TEST_PAYLOAD);

        const firstResult = await client.requestPermission({
          options: ALLOW_OPTIONS,
          toolCall: { _meta: { codeToolKind: "bash" } },
        });

        expect(firstResult.outcome.outcome).toBe("selected");
        expect(brokenSseController.send).toHaveBeenCalledTimes(1);
        expect(cloudPermissionServer.session.sseController).toBeNull();

        const secondResult = await client.requestPermission({
          options: ALLOW_OPTIONS,
          toolCall: { _meta: { codeToolKind: "bash" } },
        });

        expect(secondResult.outcome.outcome).toBe("selected");
        expect(brokenSseController.send).toHaveBeenCalledTimes(1);
        expect(appendRawLine).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("relayAgentResponse duplicate suppression", () => {
    it("skips relay when questionRelayedToSlack is set", async () => {
      const relaySpy = vi
        .spyOn(server.posthogAPI, "relayMessage")
        .mockResolvedValue(undefined);

      server.session = {
        payload: TEST_PAYLOAD,
        logWriter: {
          flush: vi.fn().mockResolvedValue(undefined),
          getFullAgentResponse: vi.fn().mockReturnValue("agent response"),
          isRegistered: vi.fn().mockReturnValue(true),
        },
      };

      server.questionRelayedToSlack = true;
      await server.relayAgentResponse(TEST_PAYLOAD);

      expect(server.questionRelayedToSlack).toBe(false);
      expect(relaySpy).not.toHaveBeenCalled();
    });

    it("relays normally when questionRelayedToSlack is not set", async () => {
      const relaySpy = vi
        .spyOn(server.posthogAPI, "relayMessage")
        .mockResolvedValue(undefined);

      server.session = {
        payload: TEST_PAYLOAD,
        logWriter: {
          flush: vi.fn().mockResolvedValue(undefined),
          getFullAgentResponse: vi.fn().mockReturnValue("agent response"),
          isRegistered: vi.fn().mockReturnValue(true),
        },
      };

      server.questionRelayedToSlack = false;
      await server.relayAgentResponse(TEST_PAYLOAD);

      expect(relaySpy).toHaveBeenCalledWith(
        "test-task-id",
        "test-run-id",
        "agent response",
      );
    });

    it("does not relay when no agent message is available", async () => {
      const relaySpy = vi
        .spyOn(server.posthogAPI, "relayMessage")
        .mockResolvedValue(undefined);

      server.session = {
        payload: TEST_PAYLOAD,
        logWriter: {
          flush: vi.fn().mockResolvedValue(undefined),
          getFullAgentResponse: vi.fn().mockReturnValue(null),
          isRegistered: vi.fn().mockReturnValue(true),
        },
      };

      server.questionRelayedToSlack = false;
      await server.relayAgentResponse(TEST_PAYLOAD);

      expect(relaySpy).not.toHaveBeenCalled();
    });
  });

  describe("sendInitialTaskMessage prompt source", () => {
    it("uses pending user prompt blocks when present", async () => {
      vi.spyOn(server.posthogAPI, "getTask").mockResolvedValue({
        id: "test-task-id",
        title: "t",
        description: "original task description",
      } as unknown as Task);
      vi.spyOn(server.posthogAPI, "getTaskRun").mockResolvedValue({
        id: "test-run-id",
        task: "test-task-id",
        state: {
          pending_user_message:
            '__twig_cloud_prompt_v1__:{"blocks":[{"type":"text","text":"read this attachment"},{"type":"resource","resource":{"uri":"attachment://test.txt","text":"hello from file","mimeType":"text/plain"}}]}',
        },
      } as unknown as TaskRun);

      const promptSpy = vi.fn().mockResolvedValue({ stopReason: "max_tokens" });
      server.session = {
        payload: TEST_PAYLOAD,
        acpSessionId: "acp-session",
        clientConnection: { prompt: promptSpy },
        logWriter: {
          flushAll: vi.fn().mockResolvedValue(undefined),
          getFullAgentResponse: vi.fn().mockReturnValue(null),
          resetTurnMessages: vi.fn(),
          flush: vi.fn().mockResolvedValue(undefined),
          isRegistered: vi.fn().mockReturnValue(true),
        },
      };

      await server.sendInitialTaskMessage(TEST_PAYLOAD);

      expect(promptSpy).toHaveBeenCalledWith({
        sessionId: "acp-session",
        prompt: [
          { type: "text", text: "read this attachment" },
          {
            type: "resource",
            resource: {
              uri: "attachment://test.txt",
              text: "hello from file",
              mimeType: "text/plain",
            },
          },
        ],
      });
    });

    it("uses run state initial_prompt_override when present", async () => {
      vi.spyOn(server.posthogAPI, "getTask").mockResolvedValue({
        id: "test-task-id",
        title: "t",
        description: "original task description",
      } as unknown as Task);
      vi.spyOn(server.posthogAPI, "getTaskRun").mockResolvedValue({
        id: "test-run-id",
        task: "test-task-id",
        state: { initial_prompt_override: "override instruction" },
      } as unknown as TaskRun);

      const promptSpy = vi.fn().mockResolvedValue({ stopReason: "max_tokens" });
      server.session = {
        payload: TEST_PAYLOAD,
        acpSessionId: "acp-session",
        clientConnection: { prompt: promptSpy },
        logWriter: {
          flushAll: vi.fn().mockResolvedValue(undefined),
          getFullAgentResponse: vi.fn().mockReturnValue(null),
          resetTurnMessages: vi.fn(),
          flush: vi.fn().mockResolvedValue(undefined),
          isRegistered: vi.fn().mockReturnValue(true),
        },
      };

      await server.sendInitialTaskMessage(TEST_PAYLOAD);

      expect(promptSpy).toHaveBeenCalledWith({
        sessionId: "acp-session",
        prompt: [{ type: "text", text: "override instruction" }],
      });
    });

    it("falls back to task description when override is missing", async () => {
      vi.spyOn(server.posthogAPI, "getTask").mockResolvedValue({
        id: "test-task-id",
        title: "t",
        description: "original task description",
      } as unknown as Task);
      vi.spyOn(server.posthogAPI, "getTaskRun").mockResolvedValue({
        id: "test-run-id",
        task: "test-task-id",
        state: {},
      } as unknown as TaskRun);

      const promptSpy = vi.fn().mockResolvedValue({ stopReason: "max_tokens" });
      server.session = {
        payload: TEST_PAYLOAD,
        acpSessionId: "acp-session",
        clientConnection: { prompt: promptSpy },
        logWriter: {
          flushAll: vi.fn().mockResolvedValue(undefined),
          getFullAgentResponse: vi.fn().mockReturnValue(null),
          resetTurnMessages: vi.fn(),
          flush: vi.fn().mockResolvedValue(undefined),
          isRegistered: vi.fn().mockReturnValue(true),
        },
      };

      await server.sendInitialTaskMessage(TEST_PAYLOAD);

      expect(promptSpy).toHaveBeenCalledWith({
        sessionId: "acp-session",
        prompt: [{ type: "text", text: "original task description" }],
      });
    });
  });
});
