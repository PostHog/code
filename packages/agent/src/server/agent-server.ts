import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from "@agentclientprotocol/sdk";
import { type ServerType, serve } from "@hono/node-server";
import { Hono } from "hono";
import packageJson from "../../package.json" with { type: "json" };
import { POSTHOG_NOTIFICATIONS } from "../acp-extensions.js";
import {
  createAcpConnection,
  type InProcessAcpConnection,
} from "../adapters/acp-connection.js";
import { PostHogAPIClient } from "../posthog-api.js";
import { SessionLogWriter } from "../session-log-writer.js";
import { TreeTracker } from "../tree-tracker.js";
import type {
  AgentMode,
  DeviceInfo,
  LogLevel,
  TaskRun,
  TreeSnapshotEvent,
} from "../types.js";
import { AsyncMutex } from "../utils/async-mutex.js";
import { getLlmGatewayUrl } from "../utils/gateway.js";
import { Logger } from "../utils/logger.js";
import { type JwtPayload, JwtValidationError, validateJwt } from "./jwt.js";
import { jsonRpcRequestSchema, validateCommandParams } from "./schemas.js";
import type { AgentServerConfig } from "./types.js";

type MessageCallback = (message: unknown) => void;

class NdJsonTap {
  private decoder = new TextDecoder();
  private buffer = "";

  constructor(private onMessage: MessageCallback) {}

  process(chunk: Uint8Array): void {
    this.buffer += this.decoder.decode(chunk, { stream: true });
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.onMessage(JSON.parse(line));
      } catch {
        // Not valid JSON, skip
      }
    }
  }
}

function createTappedReadableStream(
  underlying: ReadableStream<Uint8Array>,
  onMessage: MessageCallback,
  logger?: Logger,
): ReadableStream<Uint8Array> {
  const reader = underlying.getReader();
  const tap = new NdJsonTap(onMessage);

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        tap.process(value);
        controller.enqueue(value);
      } catch (error) {
        logger?.debug("Read failed, closing stream", error);
        controller.close();
      }
    },
    cancel() {
      reader.releaseLock();
    },
  });
}

function createTappedWritableStream(
  underlying: WritableStream<Uint8Array>,
  onMessage: MessageCallback,
  logger?: Logger,
): WritableStream<Uint8Array> {
  const tap = new NdJsonTap(onMessage);
  const mutex = new AsyncMutex();

  return new WritableStream<Uint8Array>({
    async write(chunk) {
      tap.process(chunk);
      await mutex.acquire();
      try {
        const writer = underlying.getWriter();
        await writer.write(chunk);
        writer.releaseLock();
      } catch (error) {
        logger?.debug("Write failed (stream may be closed)", error);
      } finally {
        mutex.release();
      }
    },
    async close() {
      await mutex.acquire();
      try {
        const writer = underlying.getWriter();
        await writer.close();
        writer.releaseLock();
      } catch (error) {
        logger?.debug("Close failed (stream may be closed)", error);
      } finally {
        mutex.release();
      }
    },
    async abort(reason) {
      await mutex.acquire();
      try {
        const writer = underlying.getWriter();
        await writer.abort(reason);
        writer.releaseLock();
      } catch (error) {
        logger?.debug("Abort failed (stream may be closed)", error);
      } finally {
        mutex.release();
      }
    },
  });
}

interface SseController {
  send: (data: unknown) => void;
  close: () => void;
}

interface ActiveSession {
  payload: JwtPayload;
  acpSessionId: string;
  acpConnection: InProcessAcpConnection;
  clientConnection: ClientSideConnection;
  treeTracker: TreeTracker;
  sseController: SseController | null;
  deviceInfo: DeviceInfo;
  logWriter: SessionLogWriter;
}

export class AgentServer {
  private config: AgentServerConfig;
  private logger: Logger;
  private server: ServerType | null = null;
  private session: ActiveSession | null = null;
  private app: Hono;
  private posthogAPI: PostHogAPIClient;
  private questionRelayedToSlack = false;
  private detectedPrUrl: string | null = null;

  private emitConsoleLog = (
    level: LogLevel,
    _scope: string,
    message: string,
    data?: unknown,
  ): void => {
    if (!this.session) return;

    const formatted =
      data !== undefined ? `${message} ${JSON.stringify(data)}` : message;

    const notification = {
      jsonrpc: "2.0",
      method: POSTHOG_NOTIFICATIONS.CONSOLE,
      params: { level, message: formatted },
    };

    this.broadcastEvent({
      type: "notification",
      timestamp: new Date().toISOString(),
      notification,
    });

    this.session.logWriter.appendRawLine(
      this.session.payload.run_id,
      JSON.stringify(notification),
    );
  };

  constructor(config: AgentServerConfig) {
    this.config = config;
    this.logger = new Logger({ debug: true, prefix: "[AgentServer]" });
    this.posthogAPI = new PostHogAPIClient({
      apiUrl: config.apiUrl,
      projectId: config.projectId,
      getApiKey: () => config.apiKey,
      userAgent: `posthog/cloud.hog.dev; version: ${config.version ?? packageJson.version}`,
    });
    this.app = this.createApp();
  }

  private getEffectiveMode(payload: JwtPayload): AgentMode {
    return payload.mode ?? this.config.mode;
  }

  private createApp(): Hono {
    const app = new Hono();

    app.get("/health", (c) => {
      return c.json({ status: "ok", hasSession: !!this.session });
    });

    app.get("/events", async (c) => {
      let payload: JwtPayload;

      try {
        payload = this.authenticateRequest(c.req.header.bind(c.req));
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof JwtValidationError
                ? error.message
                : "Invalid token",
            code:
              error instanceof JwtValidationError
                ? error.code
                : "invalid_token",
          },
          401,
        );
      }

      const stream = new ReadableStream({
        start: async (controller) => {
          const sseController: SseController = {
            send: (data: unknown) => {
              try {
                controller.enqueue(
                  new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`),
                );
              } catch (error) {
                this.logger.debug(
                  "SSE send failed (stream may be closed)",
                  error,
                );
              }
            },
            close: () => {
              try {
                controller.close();
              } catch (error) {
                this.logger.debug("SSE close failed (already closed)", error);
              }
            },
          };

          if (!this.session || this.session.payload.run_id !== payload.run_id) {
            await this.initializeSession(payload, sseController);
          } else {
            this.session.sseController = sseController;
          }

          this.sendSseEvent(sseController, {
            type: "connected",
            run_id: payload.run_id,
          });
        },
        cancel: () => {
          this.logger.info("SSE connection closed");
          if (this.session?.sseController) {
            this.session.sseController = null;
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    });

    app.post("/command", async (c) => {
      let payload: JwtPayload;

      try {
        payload = this.authenticateRequest(c.req.header.bind(c.req));
      } catch (error) {
        return c.json(
          {
            error:
              error instanceof JwtValidationError
                ? error.message
                : "Invalid token",
          },
          401,
        );
      }

      if (!this.session || this.session.payload.run_id !== payload.run_id) {
        return c.json({ error: "No active session for this run" }, 400);
      }

      const rawBody = await c.req.json().catch(() => null);
      const parseResult = jsonRpcRequestSchema.safeParse(rawBody);

      if (!parseResult.success) {
        return c.json({ error: "Invalid JSON-RPC request" }, 400);
      }

      const command = parseResult.data;
      const paramsValidation = validateCommandParams(
        command.method,
        command.params ?? {},
      );

      if (!paramsValidation.success) {
        return c.json(
          {
            jsonrpc: "2.0",
            id: command.id,
            error: {
              code: -32602,
              message: paramsValidation.error,
            },
          },
          200,
        );
      }

      try {
        const result = await this.executeCommand(
          command.method,
          (command.params as Record<string, unknown>) || {},
        );
        return c.json({
          jsonrpc: "2.0",
          id: command.id,
          result,
        });
      } catch (error) {
        return c.json({
          jsonrpc: "2.0",
          id: command.id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    });

    app.notFound((c) => {
      return c.json({ error: "Not found" }, 404);
    });

    return app;
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server = serve(
        {
          fetch: this.app.fetch,
          port: this.config.port,
        },
        () => {
          this.logger.info(`HTTP server listening on port ${this.config.port}`);
          resolve();
        },
      );
    });

    await this.autoInitializeSession();
  }

  private async autoInitializeSession(): Promise<void> {
    const { taskId, runId, mode, projectId } = this.config;

    this.logger.info("Auto-initializing session", { taskId, runId, mode });

    // Create a synthetic payload from config (no JWT needed for auto-init)
    const payload: JwtPayload = {
      task_id: taskId,
      run_id: runId,
      team_id: projectId,
      user_id: 0, // System-initiated
      distinct_id: "agent-server",
      mode,
    };

    await this.initializeSession(payload, null);
  }

  async stop(): Promise<void> {
    this.logger.info("Stopping agent server...");

    if (this.session) {
      await this.cleanupSession();
    }

    if (this.server) {
      this.server.close();
      this.server = null;
    }

    this.logger.info("Agent server stopped");
  }

  private authenticateRequest(
    getHeader: (name: string) => string | undefined,
  ): JwtPayload {
    // Always require JWT validation - never trust unverified headers
    if (!this.config.jwtPublicKey) {
      throw new JwtValidationError(
        "Server not configured with JWT public key",
        "server_error",
      );
    }

    const authHeader = getHeader("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new JwtValidationError(
        "Missing authorization header",
        "invalid_token",
      );
    }

    const token = authHeader.slice(7);
    return validateJwt(token, this.config.jwtPublicKey);
  }

  private async executeCommand(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.session) {
      throw new Error("No active session");
    }

    switch (method) {
      case POSTHOG_NOTIFICATIONS.USER_MESSAGE:
      case "user_message": {
        const content = params.content as string;

        this.logger.info(
          `Processing user message (detectedPrUrl=${this.detectedPrUrl ?? "none"}): ${content.substring(0, 100)}...`,
        );

        const result = await this.session.clientConnection.prompt({
          sessionId: this.session.acpSessionId,
          prompt: [{ type: "text", text: content }],
          ...(this.detectedPrUrl && {
            _meta: {
              prContext:
                `IMPORTANT — OVERRIDE PREVIOUS INSTRUCTIONS ABOUT CREATING BRANCHES/PRs.\n` +
                `You already have an open pull request: ${this.detectedPrUrl}\n` +
                `You MUST:\n` +
                `1. Check out the existing PR branch with \`gh pr checkout ${this.detectedPrUrl}\`\n` +
                `2. Make changes, commit, and push to that branch\n` +
                `You MUST NOT create a new branch, close the existing PR, or create a new PR.`,
            },
          }),
        });

        return { stopReason: result.stopReason };
      }

      case POSTHOG_NOTIFICATIONS.CANCEL:
      case "cancel": {
        this.logger.info("Cancel requested", {
          acpSessionId: this.session.acpSessionId,
        });
        await this.session.clientConnection.cancel({
          sessionId: this.session.acpSessionId,
        });
        return { cancelled: true };
      }

      case POSTHOG_NOTIFICATIONS.CLOSE:
      case "close": {
        this.logger.info("Close requested");
        await this.cleanupSession();
        return { closed: true };
      }

      default:
        throw new Error(`Unknown method: ${method}`);
    }
  }

  private async initializeSession(
    payload: JwtPayload,
    sseController: SseController | null,
  ): Promise<void> {
    if (this.session) {
      await this.cleanupSession();
    }

    this.logger.info("Initializing session", {
      runId: payload.run_id,
      taskId: payload.task_id,
    });

    const deviceInfo: DeviceInfo = {
      type: "cloud",
      name: process.env.HOSTNAME || "cloud-sandbox",
    };

    this.configureEnvironment();

    const treeTracker = new TreeTracker({
      repositoryPath: this.config.repositoryPath,
      taskId: payload.task_id,
      runId: payload.run_id,
      logger: new Logger({ debug: true, prefix: "[TreeTracker]" }),
    });

    const posthogAPI = new PostHogAPIClient({
      apiUrl: this.config.apiUrl,
      projectId: this.config.projectId,
      getApiKey: () => this.config.apiKey,
      userAgent: `posthog/cloud.hog.dev; version: ${this.config.version ?? packageJson.version}`,
    });

    const logWriter = new SessionLogWriter({
      posthogAPI,
      logger: new Logger({ debug: true, prefix: "[SessionLogWriter]" }),
    });

    const acpConnection = createAcpConnection({
      taskRunId: payload.run_id,
      taskId: payload.task_id,
      deviceType: deviceInfo.type,
      logWriter,
    });

    // Tap both streams to broadcast all ACP messages via SSE (mimics local transport)
    const onAcpMessage = (message: unknown) => {
      this.broadcastEvent({
        type: "notification",
        timestamp: new Date().toISOString(),
        notification: message,
      });
    };

    const tappedReadable = createTappedReadableStream(
      acpConnection.clientStreams.readable as ReadableStream<Uint8Array>,
      onAcpMessage,
      this.logger,
    );

    const tappedWritable = createTappedWritableStream(
      acpConnection.clientStreams.writable as WritableStream<Uint8Array>,
      onAcpMessage,
      this.logger,
    );

    const clientStream = ndJsonStream(tappedWritable, tappedReadable);

    const clientConnection = new ClientSideConnection(
      () => this.createCloudClient(payload),
      clientStream,
    );

    await clientConnection.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    let preTaskRun: TaskRun | null = null;
    try {
      preTaskRun = await this.posthogAPI.getTaskRun(
        payload.task_id,
        payload.run_id,
      );
    } catch {
      this.logger.warn("Failed to fetch task run for session context", {
        taskId: payload.task_id,
        runId: payload.run_id,
      });
    }

    const prUrl =
      typeof (preTaskRun?.state as Record<string, unknown>)
        ?.slack_notified_pr_url === "string"
        ? ((preTaskRun?.state as Record<string, unknown>)
            .slack_notified_pr_url as string)
        : null;

    if (prUrl) {
      this.detectedPrUrl = prUrl;
    }

    const sessionResponse = await clientConnection.newSession({
      cwd: this.config.repositoryPath,
      mcpServers: [],
      _meta: {
        sessionId: payload.run_id,
        taskRunId: payload.run_id,
        systemPrompt: { append: this.buildCloudSystemPrompt(prUrl) },
      },
    });

    const acpSessionId = sessionResponse.sessionId;
    this.logger.info("ACP session created", {
      acpSessionId,
      runId: payload.run_id,
    });

    this.session = {
      payload,
      acpSessionId,
      acpConnection,
      clientConnection,
      treeTracker,
      sseController,
      deviceInfo,
      logWriter,
    };

    this.logger = new Logger({
      debug: true,
      prefix: "[AgentServer]",
      onLog: (level, scope, message, data) => {
        // Preserve console output (onLog suppresses default console.*)
        const _formatted =
          data !== undefined ? `${message} ${JSON.stringify(data)}` : message;
        this.emitConsoleLog(level, scope, message, data);
      },
    });

    this.logger.info("Session initialized successfully");

    // Signal in_progress so the UI can start polling for updates
    this.posthogAPI
      .updateTaskRun(payload.task_id, payload.run_id, {
        status: "in_progress",
      })
      .catch((err) =>
        this.logger.warn("Failed to set task run to in_progress", err),
      );

    await this.sendInitialTaskMessage(payload, preTaskRun);
  }

  private async sendInitialTaskMessage(
    payload: JwtPayload,
    prefetchedRun?: TaskRun | null,
  ): Promise<void> {
    if (!this.session) return;

    try {
      const task = await this.posthogAPI.getTask(payload.task_id);

      let taskRun = prefetchedRun ?? null;
      if (!taskRun) {
        try {
          taskRun = await this.posthogAPI.getTaskRun(
            payload.task_id,
            payload.run_id,
          );
        } catch (error) {
          this.logger.warn(
            "Failed to fetch task run for initial prompt override",
            {
              taskId: payload.task_id,
              runId: payload.run_id,
              error,
            },
          );
        }
      }

      const initialPromptOverride = taskRun
        ? this.getInitialPromptOverride(taskRun)
        : null;
      const initialPrompt = initialPromptOverride ?? task.description;

      if (!initialPrompt) {
        this.logger.warn("Task has no description, skipping initial message");
        return;
      }

      this.logger.info("Sending initial task message", {
        taskId: payload.task_id,
        descriptionLength: initialPrompt.length,
        usedInitialPromptOverride: !!initialPromptOverride,
      });

      const result = await this.session.clientConnection.prompt({
        sessionId: this.session.acpSessionId,
        prompt: [{ type: "text", text: initialPrompt }],
      });

      this.logger.info("Initial task message completed", {
        stopReason: result.stopReason,
      });

      if (result.stopReason === "end_turn") {
        await this.relayAgentResponse(payload);
      }
    } catch (error) {
      this.logger.error("Failed to send initial task message", error);
      if (this.session) {
        await this.session.logWriter.flushAll();
      }
      await this.signalTaskComplete(payload, "error");
    }
  }

  private getInitialPromptOverride(taskRun: TaskRun): string | null {
    const state = taskRun.state as Record<string, unknown> | undefined;
    const override = state?.initial_prompt_override;
    if (typeof override !== "string") {
      return null;
    }

    const trimmed = override.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private buildCloudSystemPrompt(prUrl?: string | null): string {
    if (prUrl) {
      return `
# Cloud Task Execution

This task already has an open pull request: ${prUrl}

After completing the requested changes:
1. Check out the existing PR branch with \`gh pr checkout ${prUrl}\`
2. Stage and commit all changes with a clear commit message
3. Push to the existing PR branch

Important:
- Do NOT create a new branch or a new pull request.
- Do NOT add "Co-Authored-By" trailers to commit messages.
- Do NOT add "Generated with [Claude Code]" or similar attribution lines to PR descriptions.
`;
    }

    return `
# Cloud Task Execution

After completing the requested changes:
1. Create a new branch with a descriptive name based on the work done
2. Stage and commit all changes with a clear commit message
3. Push the branch to origin
4. Create a draft pull request using \`gh pr create --draft\` with a descriptive title and body

Important:
- Always create the PR as a draft. Do not ask for confirmation.
- Do NOT add "Co-Authored-By" trailers to commit messages.
- Do NOT add "Generated with [Claude Code]" or similar attribution lines to PR descriptions.
`;
  }

  private async signalTaskComplete(
    payload: JwtPayload,
    stopReason: string,
  ): Promise<void> {
    if (this.session?.payload.run_id === payload.run_id) {
      try {
        await this.session.logWriter.flush(payload.run_id);
      } catch (error) {
        this.logger.warn("Failed to flush session logs before completion", {
          taskId: payload.task_id,
          runId: payload.run_id,
          error,
        });
      }
    }

    if (stopReason !== "error") {
      this.logger.info("Skipping status update for non-error stop reason", {
        stopReason,
      });
      return;
    }

    const status = "failed";

    try {
      await this.posthogAPI.updateTaskRun(payload.task_id, payload.run_id, {
        status,
        error_message: stopReason === "error" ? "Agent error" : undefined,
      });
      this.logger.info("Task completion signaled", { status, stopReason });
    } catch (error) {
      this.logger.error("Failed to signal task completion", error);
    }
  }

  private configureEnvironment(): void {
    const { apiKey, apiUrl, projectId } = this.config;
    const product =
      this.config.mode === "background" ? "background_agents" : "posthog_code";
    const gatewayUrl =
      process.env.LLM_GATEWAY_URL || getLlmGatewayUrl(apiUrl, product);
    const openaiBaseUrl = gatewayUrl.endsWith("/v1")
      ? gatewayUrl
      : `${gatewayUrl}/v1`;

    Object.assign(process.env, {
      // PostHog
      POSTHOG_API_KEY: apiKey,
      POSTHOG_API_URL: apiUrl,
      POSTHOG_API_HOST: apiUrl,
      POSTHOG_AUTH_HEADER: `Bearer ${apiKey}`,
      POSTHOG_PROJECT_ID: String(projectId),
      // Anthropic
      ANTHROPIC_API_KEY: apiKey,
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_BASE_URL: gatewayUrl,
      // OpenAI (for models like GPT-4, o1, etc.)
      OPENAI_API_KEY: apiKey,
      OPENAI_BASE_URL: openaiBaseUrl,
      // Generic gateway
      LLM_GATEWAY_URL: gatewayUrl,
    });
  }

  private createCloudClient(payload: JwtPayload) {
    const mode = this.getEffectiveMode(payload);
    const interactionOrigin = process.env.TWIG_INTERACTION_ORIGIN;

    return {
      requestPermission: async (params: {
        options: Array<{ kind: string; optionId: string; name?: string }>;
        toolCall?: {
          _meta?: Record<string, unknown> | null;
        };
      }) => {
        // Background mode: always auto-approve permissions
        // Interactive mode: also auto-approve for now (user can monitor via SSE)
        // Future: interactive mode could pause and wait for user approval via SSE
        this.logger.debug("Permission request", {
          mode,
          interactionOrigin,
          options: params.options,
        });

        const allowOption = params.options.find(
          (o) => o.kind === "allow_once" || o.kind === "allow_always",
        );
        const selectedOptionId =
          allowOption?.optionId ?? params.options[0].optionId;

        if (interactionOrigin === "slack") {
          const twigToolKind = params.toolCall?._meta?.twigToolKind;
          if (twigToolKind === "question") {
            this.relaySlackQuestion(payload, params.toolCall?._meta);
            return {
              outcome: { outcome: "cancelled" as const },
              _meta: {
                message:
                  "This question has been relayed to the Slack thread where this task originated. " +
                  "The user will reply there. Do NOT re-ask the question or pick an answer yourself. " +
                  "Simply let the user know you are waiting for their reply.",
              },
            };
          }
        }

        return {
          outcome: {
            outcome: "selected" as const,
            optionId: selectedOptionId,
          },
        };
      },
      sessionUpdate: async (params: {
        sessionId: string;
        update?: Record<string, unknown>;
      }) => {
        // session/update notifications flow through the tapped stream (like local transport)
        // Only handle tree state capture for file changes here
        if (params.update?.sessionUpdate === "tool_call_update") {
          const meta = (params.update?._meta as Record<string, unknown>)
            ?.claudeCode as Record<string, unknown> | undefined;
          const toolName = meta?.toolName as string | undefined;
          const toolResponse = meta?.toolResponse as
            | Record<string, unknown>
            | undefined;

          if (
            (toolName === "Write" || toolName === "Edit") &&
            toolResponse?.filePath
          ) {
            await this.captureTreeState();
          }

          if (
            toolName &&
            (toolName.includes("Bash") || toolName.includes("bash"))
          ) {
            this.detectAndAttachPrUrl(payload, params.update);
          }
        }
      },
    };
  }

  private async relayAgentResponse(payload: JwtPayload): Promise<void> {
    if (!this.session) {
      return;
    }

    if (this.questionRelayedToSlack) {
      this.questionRelayedToSlack = false;
      return;
    }

    try {
      await this.session.logWriter.flush(payload.run_id);
    } catch (error) {
      this.logger.warn("Failed to flush logs before Slack relay", {
        taskId: payload.task_id,
        runId: payload.run_id,
        error,
      });
    }

    const message = this.session.logWriter.getLastAgentMessage(payload.run_id);
    if (!message) {
      this.logger.warn("No agent message found for Slack relay", {
        taskId: payload.task_id,
        runId: payload.run_id,
        sessionRegistered: this.session.logWriter.isRegistered(payload.run_id),
      });
      return;
    }

    try {
      await this.posthogAPI.relayMessage(
        payload.task_id,
        payload.run_id,
        message,
      );
    } catch (error) {
      this.logger.warn("Failed to relay initial agent response to Slack", {
        taskId: payload.task_id,
        runId: payload.run_id,
        error,
      });
    }
  }

  private relaySlackQuestion(
    payload: JwtPayload,
    toolMeta: Record<string, unknown> | null | undefined,
  ): void {
    const firstQuestion = this.getFirstQuestionMeta(toolMeta);
    if (!this.isQuestionMeta(firstQuestion)) {
      return;
    }

    let message = `*${firstQuestion.question}*\n\n`;
    if (firstQuestion.options?.length) {
      firstQuestion.options.forEach(
        (opt: { label: string; description?: string }, i: number) => {
          message += `${i + 1}. *${opt.label}*`;
          if (opt.description) message += ` — ${opt.description}`;
          message += "\n";
        },
      );
    }
    message += "\nReply in this thread with your choice.";

    this.questionRelayedToSlack = true;
    this.posthogAPI
      .relayMessage(payload.task_id, payload.run_id, message)
      .catch((err) =>
        this.logger.warn("Failed to relay question to Slack", { err }),
      );
  }

  private getFirstQuestionMeta(
    toolMeta: Record<string, unknown> | null | undefined,
  ): unknown {
    if (!toolMeta) {
      return null;
    }

    const questionsValue = toolMeta.questions;
    if (!Array.isArray(questionsValue) || questionsValue.length === 0) {
      return null;
    }

    return questionsValue[0];
  }

  private isQuestionMeta(value: unknown): value is {
    question: string;
    options?: Array<{ label: string; description?: string }>;
  } {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as {
      question?: unknown;
      options?: unknown;
    };

    if (typeof candidate.question !== "string") {
      return false;
    }

    if (candidate.options === undefined) {
      return true;
    }

    if (!Array.isArray(candidate.options)) {
      return false;
    }

    return candidate.options.every(
      (option) =>
        !!option &&
        typeof option === "object" &&
        typeof (option as { label?: unknown }).label === "string",
    );
  }

  private detectAndAttachPrUrl(
    payload: JwtPayload,
    update: Record<string, unknown>,
  ): void {
    try {
      const meta = (update?._meta as Record<string, unknown>)?.claudeCode as
        | Record<string, unknown>
        | undefined;
      const toolResponse = meta?.toolResponse;

      // Extract text content from tool response
      let textToSearch = "";

      if (toolResponse) {
        if (typeof toolResponse === "string") {
          textToSearch = toolResponse;
        } else if (typeof toolResponse === "object" && toolResponse !== null) {
          const respObj = toolResponse as Record<string, unknown>;
          textToSearch =
            String(respObj.stdout || "") + String(respObj.stderr || "");
          if (!textToSearch && respObj.output) {
            textToSearch = String(respObj.output);
          }
        }
      }

      // Also check content array
      const content = update?.content;
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item.type === "text" && item.text) {
            textToSearch += ` ${item.text}`;
          }
        }
      }

      if (!textToSearch) return;

      // Match GitHub PR URLs
      const prUrlMatch = textToSearch.match(
        /https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/,
      );
      if (!prUrlMatch) return;

      const prUrl = prUrlMatch[0];
      this.detectedPrUrl = prUrl;
      this.logger.info("Detected PR URL in bash output", {
        runId: payload.run_id,
        prUrl,
      });

      // Fire-and-forget: attach PR URL to the task run
      this.posthogAPI
        .updateTaskRun(payload.task_id, payload.run_id, {
          output: { pr_url: prUrl },
        })
        .then(() => {
          this.logger.info("PR URL attached to task run", {
            taskId: payload.task_id,
            runId: payload.run_id,
            prUrl,
          });
        })
        .catch((err) => {
          this.logger.error("Failed to attach PR URL to task run", {
            taskId: payload.task_id,
            runId: payload.run_id,
            prUrl,
            error: err,
          });
        });
    } catch (err) {
      // Never let detection errors break message flow
      this.logger.debug("Error in PR URL detection", {
        runId: payload.run_id,
        error: err,
      });
    }
  }

  private async cleanupSession(): Promise<void> {
    if (!this.session) return;

    this.logger.info("Cleaning up session");

    try {
      await this.captureTreeState();
    } catch (error) {
      this.logger.error("Failed to capture final tree state", error);
    }

    try {
      await this.session.logWriter.flush(this.session.payload.run_id);
    } catch (error) {
      this.logger.error("Failed to flush session logs", error);
    }

    try {
      await this.session.acpConnection.cleanup();
    } catch (error) {
      this.logger.error("Failed to cleanup ACP connection", error);
    }

    if (this.session.sseController) {
      this.session.sseController.close();
    }

    this.session = null;
  }

  private async captureTreeState(): Promise<void> {
    if (!this.session?.treeTracker) return;

    try {
      const snapshot = await this.session.treeTracker.captureTree({});
      if (snapshot) {
        const snapshotWithDevice: TreeSnapshotEvent = {
          ...snapshot,
          device: this.session.deviceInfo,
        };

        const notification = {
          jsonrpc: "2.0" as const,
          method: POSTHOG_NOTIFICATIONS.TREE_SNAPSHOT,
          params: snapshotWithDevice,
        };

        this.broadcastEvent({
          type: "notification",
          timestamp: new Date().toISOString(),
          notification,
        });

        // Persist to log writer so cloud runs have tree snapshots
        const { archiveUrl: _, ...paramsWithoutArchive } = snapshotWithDevice;
        const logNotification = {
          ...notification,
          params: paramsWithoutArchive,
        };
        this.session.logWriter.appendRawLine(
          this.session.payload.run_id,
          JSON.stringify(logNotification),
        );
      }
    } catch (error) {
      this.logger.error("Failed to capture tree state", error);
    }
  }

  private broadcastEvent(event: Record<string, unknown>): void {
    if (this.session?.sseController) {
      this.sendSseEvent(this.session.sseController, event);
    }
  }

  private sendSseEvent(controller: SseController, data: unknown): void {
    controller.send(data);
  }
}
