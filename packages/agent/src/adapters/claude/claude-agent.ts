import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type ModelInfo as AcpModelInfo,
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
  type SessionModelState,
  type SessionModeState,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModelRequest,
  type SetSessionModelResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
  type Usage,
} from "@agentclientprotocol/sdk";
import {
  type CanUseTool,
  getSessionMessages,
  listSessions,
  type Query,
  query,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { v7 as uuidv7 } from "uuid";
import packageJson from "../../../package.json" with { type: "json" };
import { unreachable, withTimeout } from "../../utils/common";
import { Logger } from "../../utils/logger";
import { Pushable } from "../../utils/streams";
import { BaseAcpAgent } from "../base-acp-agent";
import { promptToClaude } from "./conversion/acp-to-sdk";
import {
  handleResultMessage,
  handleStreamEvent,
  handleSystemMessage,
  handleUserAssistantMessage,
} from "./conversion/sdk-to-acp";
import { fetchMcpToolMetadata } from "./mcp/tool-metadata";
import { canUseTool } from "./permissions/permission-handlers";
import { getAvailableSlashCommands } from "./session/commands";
import { parseMcpServers } from "./session/mcp-config";
import {
  DEFAULT_MODEL,
  getDefaultContextWindow,
  toSdkModelId,
} from "./session/models";
import {
  buildSessionOptions,
  buildSystemPrompt,
  type ProcessSpawnedInfo,
} from "./session/options";
import { SettingsManager } from "./session/settings";
import {
  CODE_EXECUTION_MODES,
  type CodeExecutionMode,
  getAvailableModes,
} from "./tools";
import type {
  BackgroundTerminal,
  EffortLevel,
  NewSessionMeta,
  Session,
  ToolUseCache,
} from "./types";

const SESSION_VALIDATION_TIMEOUT_MS = 10_000;
const MAX_TITLE_LENGTH = 256;

function sanitizeTitle(text: string): string {
  const sanitized = text
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (sanitized.length <= MAX_TITLE_LENGTH) {
    return sanitized;
  }
  return `${sanitized.slice(0, MAX_TITLE_LENGTH - 1)}…`;
}

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
    // Upstream Claude Code renames .claude.json to .claude.json.backup on logout.
    // If the backup exists but the original doesn't, the user is logged out.
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
      { resume: params.sessionId, skipBackgroundFetches: true },
    );

    await this.replaySessionHistory(params.sessionId);

    // Send available commands after replay so they don't interleave with history
    this.deferBackgroundFetches(this.session.query);

    return {
      modes: response.modes,
      models: response.models,
      configOptions: response.configOptions,
    };
  }

  async unstable_listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    const sdkSessions = await listSessions({ dir: params.cwd ?? undefined });
    const sessions = [];

    for (const session of sdkSessions) {
      if (!session.cwd) continue;
      sessions.push({
        sessionId: session.sessionId,
        cwd: session.cwd,
        title: sanitizeTitle(session.customTitle || session.summary || ""),
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
              return { stopReason: "cancelled" };
            }

            // Accumulate usage from this result
            this.session.accumulatedUsage.inputTokens +=
              message.usage.input_tokens;
            this.session.accumulatedUsage.outputTokens +=
              message.usage.output_tokens;
            this.session.accumulatedUsage.cachedReadTokens +=
              message.usage.cache_read_input_tokens;
            this.session.accumulatedUsage.cachedWriteTokens +=
              message.usage.cache_creation_input_tokens;

            // Calculate context window size from modelUsage (minimum across all models used)
            const contextWindows = Object.values(message.modelUsage).map(
              (m) => m.contextWindow,
            );
            const contextWindowSize =
              contextWindows.length > 0
                ? Math.min(...contextWindows)
                : getDefaultContextWindow(this.session.modelId ?? "");

            // Send usage_update notification
            if (lastAssistantTotalUsage !== null) {
              await this.client.sessionUpdate({
                sessionId: params.sessionId,
                update: {
                  sessionUpdate: "usage_update",
                  used: lastAssistantTotalUsage,
                  size: contextWindowSize,
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
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
                cachedReadTokens: message.usage.cache_read_input_tokens,
                cachedWriteTokens: message.usage.cache_creation_input_tokens,
              },
              cost: message.total_cost_usd,
            });

            const usage: Usage = {
              inputTokens: this.session.accumulatedUsage.inputTokens,
              outputTokens: this.session.accumulatedUsage.outputTokens,
              cachedReadTokens: this.session.accumulatedUsage.cachedReadTokens,
              cachedWriteTokens:
                this.session.accumulatedUsage.cachedWriteTokens,
              totalTokens:
                this.session.accumulatedUsage.inputTokens +
                this.session.accumulatedUsage.outputTokens +
                this.session.accumulatedUsage.cachedReadTokens +
                this.session.accumulatedUsage.cachedWriteTokens,
            };

            const result = handleResultMessage(message);
            if (result.error) throw result.error;

            return { stopReason: result.stopReason ?? "end_turn", usage };
          }

          case "stream_event":
            await handleStreamEvent(message, context);
            break;

          case "user":
          case "assistant": {
            if (this.session.cancelled) {
              break;
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

            // Skip replayed user messages that aren't pending prompts
            if (
              "isReplay" in message &&
              (message as Record<string, unknown>).isReplay
            ) {
              break;
            }

            // Store latest assistant usage (excluding subagents)
            if (
              "usage" in message.message &&
              message.parent_tool_use_id === null
            ) {
              const usage = (
                message.message as unknown as Record<string, unknown>
              ).usage as {
                input_tokens: number;
                output_tokens: number;
                cache_read_input_tokens: number;
                cache_creation_input_tokens: number;
              };
              lastAssistantTotalUsage =
                usage.input_tokens +
                usage.output_tokens +
                usage.cache_read_input_tokens +
                usage.cache_creation_input_tokens;
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
          case "prompt_suggestion":
          case "rate_limit_event":
            break;

          default:
            unreachable(message as never, this.logger);
            break;
        }
      }
      throw new Error("Session did not end in result");
    } catch (error) {
      if (error instanceof RequestError || !(error instanceof Error)) {
        throw error;
      }
      const msg = error.message;
      if (
        msg.includes("ProcessTransport") ||
        msg.includes("terminated process") ||
        msg.includes("process exited with") ||
        msg.includes("process terminated by signal") ||
        msg.includes("Failed to write to process stdin")
      ) {
        this.logger.error(`Process died: ${msg}`, {
          sessionId: this.sessionId,
        });
        this.session.input.end();
        throw RequestError.internalError(
          undefined,
          "The Claude Agent process exited unexpectedly. Please start a new session.",
        );
      }
      throw error;
    } finally {
      if (!handedOff) {
        this.session.promptRunning = false;
        // Resolve all remaining pending prompts so no callers get stuck.
        for (const [key, pending] of this.session.pendingMessages) {
          pending.resolve(true);
          this.session.pendingMessages.delete(key);
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
    const sdkModelId = toSdkModelId(params.modelId);
    await this.session.query.setModel(sdkModelId);
    this.session.modelId = params.modelId;
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
      const sdkModelId = toSdkModelId(params.value);
      await this.session.query.setModel(sdkModelId);
      this.session.modelId = params.value;
    } else if (params.configId === "effort") {
      const newEffort = params.value as EffortLevel;
      this.session.effort = newEffort;
      this.session.queryOptions.effort = newEffort;
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
    if (!CODE_EXECUTION_MODES.includes(modeId as CodeExecutionMode)) {
      throw new Error("Invalid Mode");
    }
    const previousMode = this.session.permissionMode;
    this.session.permissionMode = modeId as CodeExecutionMode;
    try {
      await this.session.query.setPermissionMode(modeId as CodeExecutionMode);
    } catch (error) {
      this.session.permissionMode = previousMode;
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
    creationOpts: {
      resume?: string;
      forkSession?: boolean;
      skipBackgroundFetches?: boolean;
    } = {},
  ): Promise<NewSessionResponse> {
    const { cwd } = params;
    const { resume, forkSession } = creationOpts;

    const isResume = !!resume;

    const meta = params._meta as NewSessionMeta | undefined;
    const taskId = meta?.persistence?.taskId;
    const effort = meta?.claudeCode?.options?.effort as EffortLevel | undefined;

    // We want to create a new session id unless it is resume,
    // but not resume + forkSession.
    let sessionId: string;
    if (forkSession) {
      sessionId = uuidv7();
    } else if (isResume) {
      sessionId = resume;
    } else {
      sessionId = uuidv7();
    }

    const input = new Pushable<SDKUserMessage>();

    const settingsManager = new SettingsManager(cwd);
    await settingsManager.initialize();

    const mcpServers = parseMcpServers(params);
    const systemPrompt = buildSystemPrompt(meta?.systemPrompt);

    this.logger.info(isResume ? "Resuming session" : "Creating new session", {
      sessionId,
      taskId,
      taskRunId: meta?.taskRunId,
      cwd,
    });

    const permissionMode: CodeExecutionMode =
      meta?.permissionMode &&
      CODE_EXECUTION_MODES.includes(meta.permissionMode as CodeExecutionMode)
        ? (meta.permissionMode as CodeExecutionMode)
        : "default";

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
      onModeChange: this.createOnModeChange(),
      onProcessSpawned: this.options?.onProcessSpawned,
      onProcessExited: this.options?.onProcessExited,
      effort,
    });

    // Use the same abort controller that buildSessionOptions gave to the query
    const abortController = options.abortController as AbortController;

    const q = query({ prompt: input, options });

    const session: Session = {
      query: q,
      queryOptions: options,
      input,
      cancelled: false,
      settingsManager,
      permissionMode,
      abortController,
      accumulatedUsage: {
        inputTokens: 0,
        outputTokens: 0,
        cachedReadTokens: 0,
        cachedWriteTokens: 0,
      },
      effort,
      configOptions: [],
      promptRunning: false,
      pendingMessages: new Map(),
      nextPendingOrder: 0,

      // Custom properties
      cwd,
      notificationHistory: [],
      taskRunId: meta?.taskRunId,
    };
    this.session = session;
    this.sessionId = sessionId;

    this.logger.info(
      isResume
        ? "Session query initialized, awaiting resumption"
        : "Session query initialized, awaiting initialization",
      { sessionId, taskId, taskRunId: meta?.taskRunId },
    );

    try {
      const result = await withTimeout(
        q.initializationResult(),
        SESSION_VALIDATION_TIMEOUT_MS,
      );
      if (result.result === "timeout") {
        throw new Error(
          `Session ${isResume ? (forkSession ? "fork" : "resumption") : "initialization"} timed out for sessionId=${sessionId}`,
        );
      }
    } catch (err) {
      settingsManager.dispose();
      if (
        isResume &&
        err instanceof Error &&
        err.message === "Query closed before response received"
      ) {
        throw RequestError.resourceNotFound(sessionId);
      }
      this.logger.error(
        isResume
          ? forkSession
            ? "Session fork failed"
            : "Session resumption failed"
          : "Session initialization failed",
        {
          sessionId,
          taskId,
          taskRunId: meta?.taskRunId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
      throw err;
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
    const resolvedModelId = settingsModel || modelOptions.currentModelId;
    session.modelId = resolvedModelId;

    if (!isResume) {
      const resolvedSdkModel = toSdkModelId(resolvedModelId);
      if (resolvedSdkModel !== DEFAULT_MODEL) {
        await this.session.query.setModel(resolvedSdkModel);
      }
    }

    const availableModes = getAvailableModes();
    const modes: SessionModeState = {
      currentModeId: permissionMode,
      availableModes: availableModes.map((mode) => ({
        id: mode.id,
        name: mode.name,
        description: mode.description ?? undefined,
      })),
    };

    const models: SessionModelState = {
      currentModelId: resolvedModelId,
      availableModels: modelOptions.options.map(
        (opt): AcpModelInfo => ({
          modelId: opt.value,
          name: opt.name,
          description: opt.description,
        }),
      ),
    };

    const configOptions = this.buildConfigOptions(
      permissionMode,
      modelOptions,
      effort ?? "high",
    );
    session.configOptions = configOptions;

    if (!creationOpts.skipBackgroundFetches) {
      this.deferBackgroundFetches(q);
    }

    this.logger.info(
      isResume
        ? "Session resumed successfully"
        : "Session created successfully",
      {
        sessionId,
        taskId,
        taskRunId: meta?.taskRunId,
      },
    );

    return { sessionId, modes, models, configOptions };
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

  private createOnModeChange() {
    return async (newMode: CodeExecutionMode) => {
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
    currentEffort: EffortLevel = "high",
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
      {
        id: "effort",
        name: "Effort",
        type: "select",
        currentValue: currentEffort,
        options: [
          { value: "low", name: "Low" },
          { value: "medium", name: "Medium" },
          { value: "high", name: "High" },
          { value: "max", name: "Max" },
        ],
        category: "thought_level" as SessionConfigOptionCategory,
        description: "Controls how much effort Claude puts into its response",
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
  // EXTENSION METHODS
  // ================================

  /**
   * Fire-and-forget: fetch slash commands and MCP tool metadata in parallel.
   * Both populate caches used later — neither is needed to return configOptions.
   */
  private deferBackgroundFetches(q: Query): void {
    Promise.all([
      new Promise<void>((resolve) => setTimeout(resolve, 10)).then(() =>
        this.sendAvailableCommandsUpdate(),
      ),
      fetchMcpToolMetadata(q, this.logger),
    ]).catch((err) =>
      this.logger.error("Background fetch failed", { error: err }),
    );
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
