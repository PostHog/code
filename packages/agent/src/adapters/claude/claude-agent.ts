import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentSideConnection,
  type ClientCapabilities,
  type ForkSessionRequest,
  type ForkSessionResponse,
  type InitializeRequest,
  type InitializeResponse,
  type ListSessionsRequest,
  type ListSessionsResponse,
  type LoadSessionRequest,
  type LoadSessionResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  RequestError,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type SessionConfigOption,
  type SessionConfigOptionCategory,
  type SessionConfigSelectOption,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModelRequest,
  type SetSessionModelResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import {
  type CanUseTool,
  getSessionMessages,
  listSessions,
  type Query,
  query,
  type SDKResultMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { v7 as uuidv7 } from "uuid";
import packageJson from "../../../package.json" with { type: "json" };
import { unreachable, withTimeout } from "../../utils/common.js";
import { Logger } from "../../utils/logger.js";
import { Pushable } from "../../utils/streams.js";
import { BaseAcpAgent } from "../base-acp-agent.js";
import { promptToClaude } from "./conversion/acp-to-sdk.js";
import {
  handleResultMessage,
  handleStreamEvent,
  handleSystemMessage,
  handleUserAssistantMessage,
} from "./conversion/sdk-to-acp.js";
import { fetchMcpToolMetadata } from "./mcp/tool-metadata.js";
import { canUseTool } from "./permissions/permission-handlers.js";
import { getAvailableSlashCommands } from "./session/commands.js";
import { parseMcpServers } from "./session/mcp-config.js";
import { DEFAULT_MODEL, toSdkModelId } from "./session/models.js";
import {
  buildSessionOptions,
  buildSystemPrompt,
  type ProcessSpawnedInfo,
} from "./session/options.js";
import { SettingsManager } from "./session/settings.js";
import {
  getAvailableModes,
  TWIG_EXECUTION_MODES,
  type TwigExecutionMode,
} from "./tools.js";
import type {
  BackgroundTerminal,
  NewSessionMeta,
  Session,
  ToolUseCache,
} from "./types.js";

const SESSION_VALIDATION_TIMEOUT_MS = 10_000;

export interface ClaudeAcpAgentOptions {
  onProcessSpawned?: (info: ProcessSpawnedInfo) => void;
  onProcessExited?: (pid: number) => void;
}

export class ClaudeAcpAgent extends BaseAcpAgent {
  readonly adapterName = "claude";
  declare session: Session;
  toolUseCache: ToolUseCache;
  backgroundTerminals: { [key: string]: BackgroundTerminal } = {};
  clientCapabilities?: ClientCapabilities;
  private options?: ClaudeAcpAgentOptions;

  constructor(client: AgentSideConnection, options?: ClaudeAcpAgentOptions) {
    super(client);
    this.options = options;
    this.toolUseCache = {};
    this.logger = new Logger({ debug: true, prefix: "[ClaudeAcpAgent]" });
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    this.clientCapabilities = request.clientCapabilities;

    return {
      protocolVersion: 1,
      agentCapabilities: {
        promptCapabilities: {
          image: true,
          embeddedContext: true,
        },
        mcpCapabilities: {
          http: true,
          sse: true,
        },
        loadSession: true,
        sessionCapabilities: {
          list: {},
          fork: {},
          resume: {},
        },
        _meta: {
          posthog: {
            resumeSession: true,
          },
          claudeCode: {
            promptQueueing: true,
          },
        },
      },
      agentInfo: {
        name: packageJson.name,
        title: "Claude Agent",
        version: packageJson.version,
      },
      authMethods: [],
    };
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    if (
      fs.existsSync(path.resolve(os.homedir(), ".claude.json.backup")) &&
      !fs.existsSync(path.resolve(os.homedir(), ".claude.json"))
    ) {
      throw RequestError.authRequired();
    }

    const response = await this.createSession(params, {
      // Revisit these meta values once we support resume
      resume: (params._meta as NewSessionMeta | undefined)?.claudeCode?.options
        ?.resume as string | undefined,
    });

    return response;
  }

  async unstable_forkSession(
    params: ForkSessionRequest,
  ): Promise<ForkSessionResponse> {
    return this.createSession(
      {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        _meta: params._meta,
      },
      { resume: params.sessionId, forkSession: true },
    );
  }

  async unstable_resumeSession(
    params: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    const response = await this.createSession(
      {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        _meta: params._meta,
      },
      {
        resume: params.sessionId,
      },
    );

    return response;
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const response = await this.createSession(
      {
        cwd: params.cwd,
        mcpServers: params.mcpServers ?? [],
        _meta: params._meta,
      },
      { resume: params.sessionId },
    );

    await this.replaySessionHistory(params.sessionId);

    return {
      modes: response.modes,
      models: response.models,
      configOptions: response.configOptions,
    };
  }

  async unstable_listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    const sdk_sessions = await listSessions({ dir: params.cwd ?? undefined });
    const sessions = [];

    for (const session of sdk_sessions) {
      if (!session.cwd) continue;
      sessions.push({
        sessionId: session.sessionId,
        cwd: session.cwd,
        title: session.customTitle,
        updatedAt: new Date(session.lastModified).toISOString(),
      });
    }
    return {
      sessions,
    };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.session.cancelled = false;
    this.session.interruptReason = undefined;
    this.session.accumulatedUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
    };

    const userMessage = promptToClaude(params);

    if (this.session.promptRunning) {
      const uuid = randomUUID();
      userMessage.uuid = uuid;
      this.session.input.push(userMessage);
      const order = this.session.nextPendingOrder++;
      const cancelled = await new Promise<boolean>((resolve) => {
        this.session.pendingMessages.set(uuid, { resolve, order });
      });
      if (cancelled) {
        return { stopReason: "cancelled" };
      }
    } else {
      this.session.input.push(userMessage);
    }

    // Broadcast user message to client
    await this.broadcastUserMessage(params);

    this.session.promptRunning = true;
    let handedOff = false;
    let lastAssistantTotalUsage: number | null = null;

    const supportsTerminalOutput =
      (
        this.clientCapabilities?._meta as
          | ClientCapabilities["_meta"]
          | undefined
      )?.terminal_output === true;

    const context = {
      session: this.session,
      sessionId: params.sessionId,
      client: this.client,
      toolUseCache: this.toolUseCache,
      fileContentCache: this.fileContentCache,
      logger: this.logger,
      supportsTerminalOutput,
    };

    try {
      while (true) {
        const { value: message, done } = await this.session.query.next();

        if (done || !message) {
          if (this.session.cancelled) {
            return {
              stopReason: "cancelled",
              _meta: this.session.interruptReason
                ? { interruptReason: this.session.interruptReason }
                : undefined,
            };
          }
          break;
        }

        switch (message.type) {
          case "system":
            if (message.subtype === "compact_boundary") {
              lastAssistantTotalUsage = 0;
            }
            await handleSystemMessage(message, context);
            break;

          case "result": {
            if (this.session.cancelled) {
              return {
                stopReason: "cancelled",
              };
            }
            const result = handleResultMessage(message);
            if (result.usage) {
              this.session.accumulatedUsage.inputTokens +=
                result.usage.inputTokens;
              this.session.accumulatedUsage.outputTokens +=
                result.usage.outputTokens;
              this.session.accumulatedUsage.cachedReadTokens +=
                result.usage.cachedReadTokens;
              this.session.accumulatedUsage.cachedWriteTokens +=
                result.usage.cachedWriteTokens;

              // Calculate context window size from modelUsage (minimum across all models used)
              const contextWindows = Object.values(message.modelUsage).map(
                (m) => m.contextWindow,
              );
              const contextWindowSize =
                contextWindows.length > 0
                  ? Math.min(...contextWindows)
                  : 200000;

              // Send usage_update notification
              if (lastAssistantTotalUsage !== null) {
                await this.client.sessionUpdate({
                  sessionId: params.sessionId,
                  update: {
                    sessionUpdate: "usage_update",
                    used: BigInt(lastAssistantTotalUsage),
                    size: BigInt(contextWindowSize),
                    cost: {
                      amount: message.total_cost_usd,
                      currency: "USD",
                    },
                  },
                });
              }

              await this.client.extNotification("_posthog/usage_update", {
                sessionId: params.sessionId,
                used: {
                  inputTokens: result.usage.inputTokens,
                  outputTokens: result.usage.outputTokens,
                  cachedReadTokens: result.usage.cachedReadTokens,
                  cachedWriteTokens: result.usage.cachedWriteTokens,
                },
                cost: result.usage.costUsd,
              });
            }
            if (result.error) throw result.error;
            break;
          }

          case "stream_event":
            await handleStreamEvent(message, context);
            break;

          case "user":
          case "assistant": {
            if (this.session.cancelled) {
              return { stopReason: "cancelled" };
            }

            // Check for queued prompt replay
            if (message.type === "user" && "uuid" in message && message.uuid) {
              const pending = this.session.pendingMessages.get(
                message.uuid as string,
              );
              if (pending) {
                pending.resolve(false);
                this.session.pendingMessages.delete(message.uuid as string);
                handedOff = true;
                // the current loop stops with end_turn,
                // the loop of the next prompt continues running
                return { stopReason: "end_turn" };
              }
            }

            // Store latest assistant usage (excluding subagents)
            if (
              "usage" in message.message &&
              message.parent_tool_use_id === null
            ) {
              const messageWithUsage =
                message.message as unknown as SDKResultMessage;
              lastAssistantTotalUsage =
                messageWithUsage.usage.input_tokens +
                messageWithUsage.usage.output_tokens +
                messageWithUsage.usage.cache_read_input_tokens +
                messageWithUsage.usage.cache_creation_input_tokens;
            }

            const result = await handleUserAssistantMessage(message, context);
            if (result.error) throw result.error;
            if (result.shouldStop) {
              return { stopReason: "end_turn" };
            }
            break;
          }

          case "tool_progress":
          case "auth_status":
          case "tool_use_summary":
            break;

          default:
            unreachable(message, this.logger);
            break;
        }
      }
      throw new Error("Session did not end in result");
    } finally {
      if (!handedOff) {
        this.session.promptRunning = false;
        // This usually should not happen, but in case the loop finishes
        // without claude sending all message replays, we resolve the
        // next pending prompt call to ensure no prompts get stuck.
        if (this.session.pendingMessages.size > 0) {
          const next = [...this.session.pendingMessages.entries()].sort(
            (a, b) => a[1].order - b[1].order,
          )[0];
          if (next) {
            next[1].resolve(false);
            this.session.pendingMessages.delete(next[0]);
          }
        }
      }
    }
  }

  // Called by BaseAcpAgent#cancel() to interrupt the session
  protected async interrupt(): Promise<void> {
    this.session.cancelled = true;
    for (const [, pending] of this.session.pendingMessages) {
      pending.resolve(true);
    }
    this.session.pendingMessages.clear();
    await this.session.query.interrupt();
  }

  async unstable_setSessionModel(
    params: SetSessionModelRequest,
  ): Promise<SetSessionModelResponse | undefined> {
    await this.session.query.setModel(params.modelId);
    await this.updateConfigOption("model", params.modelId);
    return {};
  }

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    await this.applySessionMode(params.modeId);
    await this.updateConfigOption("mode", params.modeId);
    return {};
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    const option = this.session.configOptions.find(
      (o) => o.id === params.configId,
    );
    if (!option) {
      throw new Error(`Unknown config option: ${params.configId}`);
    }

    const allValues: { value: string }[] =
      "options" in option && Array.isArray(option.options)
        ? (option.options as Array<Record<string, unknown>>).flatMap((o) =>
            "options" in o && Array.isArray(o.options)
              ? (o.options as { value: string }[])
              : [o as { value: string }],
          )
        : [];
    const validValue = allValues.find((o) => o.value === params.value);
    if (!validValue) {
      throw new Error(
        `Invalid value for config option ${params.configId}: ${params.value}`,
      );
    }

    if (params.configId === "mode") {
      await this.applySessionMode(params.value);
      await this.client.sessionUpdate({
        sessionId: this.sessionId,
        update: {
          sessionUpdate: "current_mode_update",
          currentModeId: params.value,
        },
      });
    } else if (params.configId === "model") {
      await this.session.query.setModel(params.value);
    }

    this.session.configOptions = this.session.configOptions.map((o) =>
      o.id === params.configId ? { ...o, currentValue: params.value } : o,
    );

    return { configOptions: this.session.configOptions };
  }

  private async updateConfigOption(
    configId: string,
    value: string,
  ): Promise<void> {
    this.session.configOptions = this.session.configOptions.map((o) =>
      o.id === configId ? { ...o, currentValue: value } : o,
    );

    await this.client.sessionUpdate({
      sessionId: this.sessionId,
      update: {
        sessionUpdate: "config_option_update",
        configOptions: this.session.configOptions,
      },
    });
  }

  private async applySessionMode(modeId: string): Promise<void> {
    if (!TWIG_EXECUTION_MODES.includes(modeId as TwigExecutionMode)) {
      throw new Error("Invalid Mode");
    }
    this.session.permissionMode = modeId as TwigExecutionMode;
    try {
      await this.session.query.setPermissionMode(modeId as TwigExecutionMode);
    } catch (error) {
      if (error instanceof Error) {
        if (!error.message) {
          error.message = "Invalid Mode";
        }
        throw error;
      }
      throw new Error("Invalid Mode");
    }
  }

  private async createSession(
    params: {
      cwd: string;
      mcpServers: NewSessionRequest["mcpServers"];
      _meta?: unknown;
    },
    creationOpts: { resume?: string; forkSession?: boolean } = {},
  ): Promise<NewSessionResponse> {
    const meta = params._meta as NewSessionMeta | undefined;
    const mcpServers = parseMcpServers(params);
    const { cwd } = params;
    const { resume, forkSession } = creationOpts;

    let sessionId: string;
    if (forkSession) {
      sessionId = uuidv7();
    } else if (resume) {
      sessionId = resume;
    } else {
      sessionId = uuidv7();
    }

    const isResume = !!resume;
    const taskId = meta?.persistence?.taskId;

    this.logger.info(isResume ? "Resuming session" : "Creating new session", {
      sessionId,
      taskId,
      taskRunId: meta?.taskRunId,
      cwd,
    });

    const settingsManager = new SettingsManager(cwd, {
      logger: this.logger,
    });
    await settingsManager.initialize();

    const permissionMode: TwigExecutionMode =
      meta?.permissionMode &&
      TWIG_EXECUTION_MODES.includes(meta.permissionMode as TwigExecutionMode)
        ? (meta.permissionMode as TwigExecutionMode)
        : "default";

    const systemPrompt = buildSystemPrompt(meta?.systemPrompt);

    const options = buildSessionOptions({
      cwd,
      mcpServers,
      permissionMode,
      canUseTool: this.createCanUseTool(sessionId),
      logger: this.logger,
      systemPrompt,
      userProvidedOptions: meta?.claudeCode?.options,
      sessionId,
      isResume,
      forkSession,
      additionalDirectories: meta?.claudeCode?.options?.additionalDirectories,
      disableBuiltInTools: meta?.disableBuiltInTools,
      settingsManager,
      onModeChange: this.createOnModeChange(sessionId),
      onProcessSpawned: this.options?.onProcessSpawned,
      onProcessExited: this.options?.onProcessExited,
    });

    const input = new Pushable<SDKUserMessage>();
    if (!isResume) {
      options.model = DEFAULT_MODEL;
    }
    const q = query({ prompt: input, options });
    const abortController = options.abortController as AbortController;

    const session: Session = {
      query: q,
      input,
      settingsManager,
      cancelled: false,
      permissionMode,
      cwd,
      notificationHistory: [],
      abortController,
      configOptions: [],
      accumulatedUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedReadTokens: 0,
        cachedWriteTokens: 0,
      },
      promptRunning: false,
      pendingMessages: new Map(),
      nextPendingOrder: 0,
    };
    this.session = session;
    this.sessionId = sessionId;
    session.taskRunId = meta?.taskRunId;

    if (isResume) {
      this.logger.info("Session query initialized, awaiting resumption", {
        sessionId,
        taskId,
        taskRunId: meta?.taskRunId,
      });

      try {
        const result = await withTimeout(
          q.initializationResult(),
          SESSION_VALIDATION_TIMEOUT_MS,
        );
        if (result.result === "timeout") {
          throw new Error(
            `Session ${forkSession ? "fork" : "resumption"} timed out for sessionId=${sessionId}`,
          );
        }
      } catch (err) {
        this.logger.error(
          forkSession ? "Session fork failed" : "Session resumption failed",
          {
            sessionId,
            taskId,
            taskRunId: meta?.taskRunId,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        throw err;
      }

      this.logger.info("Session resumed successfully", {
        sessionId,
        taskId,
        taskRunId: meta?.taskRunId,
      });
    }

    if (meta?.taskRunId) {
      await this.client.extNotification("_posthog/sdk_session", {
        taskRunId: meta.taskRunId,
        sessionId,
        adapter: "claude",
      });
    }

    // Resolve model: settings model takes priority, then gateway
    const settingsModel = settingsManager.getSettings().model;
    const modelOptions = await this.getModelConfigOptions();

    this.deferBackgroundFetches(q);

    const resolvedModelId = settingsModel || modelOptions.currentModelId;
    session.modelId = resolvedModelId;

    if (!isResume) {
      const resolvedSdkModel = toSdkModelId(resolvedModelId);
      if (resolvedSdkModel !== DEFAULT_MODEL) {
        await this.session.query.setModel(resolvedSdkModel);
      }
    }

    const configOptions = this.buildConfigOptions(permissionMode, modelOptions);
    session.configOptions = configOptions;

    return { sessionId, configOptions };
  }

  private createCanUseTool(sessionId: string): CanUseTool {
    return async (toolName, toolInput, { suggestions, toolUseID, signal }) =>
      canUseTool({
        session: this.session,
        toolName,
        toolInput: toolInput as Record<string, unknown>,
        toolUseID,
        suggestions,
        signal,
        client: this.client,
        sessionId,
        fileContentCache: this.fileContentCache,
        logger: this.logger,
        updateConfigOption: (configId: string, value: string) =>
          this.updateConfigOption(configId, value),
      });
  }

  private createOnModeChange(_sessionId: string) {
    return async (newMode: TwigExecutionMode) => {
      if (this.session) {
        this.session.permissionMode = newMode;
      }
      await this.updateConfigOption("mode", newMode);
    };
  }

  private buildConfigOptions(
    currentModeId: string,
    modelOptions: {
      currentModelId: string;
      options: SessionConfigSelectOption[];
    },
  ): SessionConfigOption[] {
    const modeOptions = getAvailableModes().map((mode) => ({
      value: mode.id,
      name: mode.name,
      description: mode.description ?? undefined,
    }));

    return [
      {
        id: "mode",
        name: "Approval Preset",
        type: "select",
        currentValue: currentModeId,
        options: modeOptions,
        category: "mode" as SessionConfigOptionCategory,
        description:
          "Choose an approval and sandboxing preset for your session",
      },
      {
        id: "model",
        name: "Model",
        type: "select",
        currentValue: modelOptions.currentModelId,
        options: modelOptions.options,
        category: "model" as SessionConfigOptionCategory,
        description: "Choose which model Claude should use",
      },
    ];
  }

  private async sendAvailableCommandsUpdate(): Promise<void> {
    const commands = await this.session.query.supportedCommands();
    await this.client.sessionUpdate({
      sessionId: this.sessionId,
      update: {
        sessionUpdate: "available_commands_update",
        availableCommands: getAvailableSlashCommands(commands),
      },
    });
  }

  private async replaySessionHistory(sessionId: string): Promise<void> {
    try {
      const messages = await getSessionMessages(sessionId, {
        dir: this.session.cwd,
      });

      const replayContext = {
        session: this.session,
        sessionId,
        client: this.client,
        toolUseCache: this.toolUseCache,
        fileContentCache: this.fileContentCache,
        logger: this.logger,
        registerHooks: false,
      };

      for (const msg of messages) {
        const sdkMessage = {
          type: msg.type,
          message: msg.message as {
            content: string | Array<{ type: string; text?: string }>;
            role: typeof msg.type;
          },
          parent_tool_use_id: msg.parent_tool_use_id,
        };
        await handleUserAssistantMessage(
          sdkMessage as Parameters<typeof handleUserAssistantMessage>[0],
          replayContext,
        );
      }
    } catch (err) {
      this.logger.warn("Failed to replay session history", {
        sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ================================
  // PATCH METHODS
  // ================================

  /**
   * Fire-and-forget: fetch slash commands and MCP tool metadata in parallel.
   * Both populate caches used later — neither is needed to return configOptions.
   */
  private deferBackgroundFetches(q: Query): void {
    Promise.all([
      setTimeout(() => this.sendAvailableCommandsUpdate(), 10),
      fetchMcpToolMetadata(q, this.logger),
    ]);
  }

  async extMethod(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (method === "_posthog/session/resume") {
      const result = await this.unstable_resumeSession(
        params as unknown as ResumeSessionRequest,
      );
      return { _meta: { configOptions: result.configOptions } };
    }
    throw RequestError.methodNotFound(method);
  }

  private async broadcastUserMessage(params: PromptRequest): Promise<void> {
    for (const chunk of params.prompt) {
      const notification = {
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "user_message_chunk" as const,
          content: chunk,
        },
      };
      await this.client.sessionUpdate(notification);
      this.appendNotification(params.sessionId, notification);
    }
  }
}
