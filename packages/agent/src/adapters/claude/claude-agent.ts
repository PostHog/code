import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  type AgentSideConnection,
  type AuthenticateRequest,
  type AvailableCommand,
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
} from "@agentclientprotocol/sdk";
import {
  type CanUseTool,
  getSessionMessages,
  listSessions,
  type Options,
  type Query,
  query,
  type SDKMessage,
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
  private lastSentConfigOptions?: SessionConfigOption[];

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
        title: "Claude Code",
        version: packageJson.version,
      },
      authMethods: [
        {
          id: "claude-login",
          name: "Log in with Claude Code",
          description: "Run `claude /login` in the terminal",
        },
      ],
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.checkAuthStatus();

    const meta = params._meta as NewSessionMeta | undefined;
    const taskId = meta?.persistence?.taskId;
    const sessionId = uuidv7();
    this.logger.info("Creating new session", {
      sessionId,
      taskId,
      taskRunId: meta?.taskRunId,
      cwd: params.cwd,
    });
    const permissionMode: TwigExecutionMode =
      meta?.permissionMode &&
      TWIG_EXECUTION_MODES.includes(meta.permissionMode as TwigExecutionMode)
        ? (meta.permissionMode as TwigExecutionMode)
        : "default";

    const mcpServers = parseMcpServers(params);

    const options = buildSessionOptions({
      cwd: params.cwd,
      mcpServers,
      permissionMode,
      canUseTool: this.createCanUseTool(sessionId),
      logger: this.logger,
      systemPrompt: buildSystemPrompt(meta?.systemPrompt),
      userProvidedOptions: meta?.claudeCode?.options,
      sessionId,
      isResume: false,
      disableBuiltInTools: meta?.disableBuiltInTools,
      onModeChange: this.createOnModeChange(sessionId),
      onProcessSpawned: this.options?.onProcessSpawned,
      onProcessExited: this.options?.onProcessExited,
    });

    const input = new Pushable<SDKUserMessage>();
    // Pass default model at construction to avoid expensive post-hoc setModel IPC
    options.model = DEFAULT_MODEL;
    const q = query({ prompt: input, options });

    const session = this.createSession(
      sessionId,
      q,
      input,
      permissionMode,
      params.cwd,
      options.abortController as AbortController,
    );
    session.taskRunId = meta?.taskRunId;

    if (meta?.taskRunId) {
      await this.client.extNotification("_posthog/sdk_session", {
        taskRunId: meta.taskRunId,
        sessionId,
        adapter: "claude",
      });
    }

    // Only await model config — slash commands and MCP metadata are deferred
    // since they're not needed to return configOptions to the client.
    const modelOptions = await this.getModelConfigOptions();

    // Deferred: slash commands + MCP metadata (not needed to return configOptions)
    this.deferBackgroundFetches(q, sessionId);

    session.modelId = modelOptions.currentModelId;
    // Only call setModel if the resolved model differs from the default we
    // already baked into the query options — avoids a ~2s IPC round-trip.
    const resolvedSdkModel = toSdkModelId(modelOptions.currentModelId);
    if (resolvedSdkModel !== DEFAULT_MODEL) {
      await this.trySetModel(q, modelOptions.currentModelId);
    }

    const configOptions = await this.buildConfigOptions(modelOptions);

    return {
      sessionId,
      configOptions,
    };
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const result = await this.resumeSession(params);
    if (params.sessionId) {
      await this.replaySessionHistory(params.sessionId);
    }
    return result;
  }

  async resumeSession(
    params: LoadSessionRequest,
  ): Promise<LoadSessionResponse> {
    const meta = params._meta as NewSessionMeta | undefined;
    const taskId = meta?.persistence?.taskId;
    const sessionId = params.sessionId;
    if (!sessionId) {
      throw new Error("Cannot resume session without sessionId");
    }
    if (this.sessionId === sessionId) {
      return {};
    }

    this.logger.info("Resuming session", {
      sessionId,
      taskId,
      taskRunId: meta?.taskRunId,
      cwd: params.cwd,
    });

    const mcpServers = parseMcpServers(params);

    const permissionMode: TwigExecutionMode =
      meta?.permissionMode &&
      TWIG_EXECUTION_MODES.includes(meta.permissionMode as TwigExecutionMode)
        ? (meta.permissionMode as TwigExecutionMode)
        : "default";

    const { query: q, session } = await this.initializeQuery({
      cwd: params.cwd,
      permissionMode,
      mcpServers,
      systemPrompt: buildSystemPrompt(meta?.systemPrompt),
      userProvidedOptions: meta?.claudeCode?.options,
      sessionId,
      isResume: true,
      additionalDirectories: meta?.claudeCode?.options?.additionalDirectories,
    });

    this.logger.info("Session query initialized, awaiting resumption", {
      sessionId,
      taskId,
      taskRunId: meta?.taskRunId,
    });

    session.taskRunId = meta?.taskRunId;

    // Check the resumed session is alive. For stale sessions this throws
    // (e.g. "No conversation found"), preventing a broken session.
    try {
      const result = await withTimeout(
        q.initializationResult(),
        SESSION_VALIDATION_TIMEOUT_MS,
      );
      if (result.result === "timeout") {
        throw new Error(
          `Session resumption timed out for sessionId=${sessionId}`,
        );
      }
    } catch (err) {
      this.logger.error("Session resumption failed", {
        sessionId,
        taskId,
        taskRunId: meta?.taskRunId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.logger.info("Session resumed successfully", {
      sessionId,
      taskId,
      taskRunId: meta?.taskRunId,
    });

    // Deferred: slash commands + MCP metadata (not needed to return configOptions)
    this.deferBackgroundFetches(q, sessionId);

    const configOptions = await this.buildConfigOptions();

    return { configOptions };
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    if (this.session.promptRunning) {
      const uuid = randomUUID();
      const sdkMessage = promptToClaude(params);
      (sdkMessage as Record<string, unknown>).uuid = uuid;

      await this.broadcastUserMessage(params);
      this.session.input.push(sdkMessage);

      const order = this.session.nextPendingOrder++;
      const cancelled = await new Promise<boolean>((resolve) => {
        this.session.pendingMessages.set(uuid, { resolve, order });
      });

      return { stopReason: cancelled ? "cancelled" : "end_turn" };
    }

    this.session.promptRunning = true;
    this.session.cancelled = false;
    this.session.interruptReason = undefined;
    this.session.accumulatedUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
    };

    await this.broadcastUserMessage(params);
    this.session.input.push(promptToClaude(params));

    return this.processMessages(params.sessionId);
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    const configId = params.configId;
    const value = params.value;

    if (configId === "mode") {
      const modeId = value as TwigExecutionMode;
      if (!TWIG_EXECUTION_MODES.includes(modeId)) {
        throw new Error("Invalid Mode");
      }
      this.session.permissionMode = modeId;
      await this.session.query.setPermissionMode(modeId);
    } else if (configId === "model") {
      await this.setModelWithFallback(this.session.query, value);
      this.session.modelId = value;
    } else {
      throw new Error("Unsupported config option");
    }

    await this.emitConfigOptionsUpdate();
    return { configOptions: await this.buildConfigOptions() };
  }

  protected async interruptSession(): Promise<void> {
    for (const [uuid, pending] of this.session.pendingMessages) {
      pending.resolve(true);
      this.session.pendingMessages.delete(uuid);
    }
    await this.session.query.interrupt();
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

  async unstable_listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    const sessions = await listSessions({
      dir: params.cwd ?? undefined,
    });
    return {
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        cwd: s.cwd ?? params.cwd ?? "",
        title: s.customTitle ?? s.summary,
        updatedAt: new Date(s.lastModified).toISOString(),
      })),
    };
  }

  async unstable_forkSession(
    params: ForkSessionRequest,
  ): Promise<ForkSessionResponse> {
    const cwd = params.cwd || this.session?.cwd || process.cwd();
    const permissionMode = this.session?.permissionMode ?? "default";
    const mcpServers = parseMcpServers({
      ...params,
      mcpServers: params.mcpServers ?? [],
    });

    const newSessionId = uuidv7();

    const { query: q } = await this.initializeQuery({
      cwd,
      permissionMode,
      mcpServers,
      sessionId: params.sessionId,
      isResume: true,
      forkSession: true,
    });

    try {
      const result = await withTimeout(
        q.initializationResult(),
        SESSION_VALIDATION_TIMEOUT_MS,
      );
      if (result.result === "timeout") {
        throw new Error(
          `Session fork timed out for sessionId=${params.sessionId}`,
        );
      }
    } catch (err) {
      this.logger.error("Session fork failed", {
        sessionId: params.sessionId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    this.deferBackgroundFetches(q, newSessionId);

    const configOptions = await this.buildConfigOptions();
    return { sessionId: newSessionId, configOptions };
  }

  async unstable_resumeSession(
    params: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    const loadParams: LoadSessionRequest = {
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      sessionId: params.sessionId,
      _meta: params._meta,
    };
    const result = await this.resumeSession(loadParams);
    return { configOptions: result.configOptions };
  }

  private createSession(
    sessionId: string,
    q: Query,
    input: Pushable<SDKUserMessage>,
    permissionMode: TwigExecutionMode,
    cwd: string,
    abortController: AbortController,
  ): Session {
    const session: Session = {
      query: q,
      input,
      cancelled: false,
      permissionMode,
      cwd,
      notificationHistory: [],
      abortController,
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
    return session;
  }

  private async initializeQuery(config: {
    cwd: string;
    permissionMode: TwigExecutionMode;
    mcpServers: ReturnType<typeof parseMcpServers>;
    userProvidedOptions?: Options;
    systemPrompt?: Options["systemPrompt"];
    sessionId: string;
    isResume: boolean;
    forkSession?: boolean;
    additionalDirectories?: string[];
  }): Promise<{
    query: Query;
    input: Pushable<SDKUserMessage>;
    session: Session;
  }> {
    const input = new Pushable<SDKUserMessage>();

    const options = buildSessionOptions({
      cwd: config.cwd,
      mcpServers: config.mcpServers,
      permissionMode: config.permissionMode,
      canUseTool: this.createCanUseTool(config.sessionId),
      logger: this.logger,
      systemPrompt: config.systemPrompt,
      userProvidedOptions: config.userProvidedOptions,
      sessionId: config.sessionId,
      isResume: config.isResume,
      forkSession: config.forkSession,
      additionalDirectories: config.additionalDirectories,
      onModeChange: this.createOnModeChange(config.sessionId),
      onProcessSpawned: this.options?.onProcessSpawned,
      onProcessExited: this.options?.onProcessExited,
    });

    const q = query({ prompt: input, options });
    const abortController = options.abortController as AbortController;

    const session = this.createSession(
      config.sessionId,
      q,
      input,
      config.permissionMode,
      config.cwd,
      abortController,
    );

    return { query: q, input, session };
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
        emitConfigOptionsUpdate: () => this.emitConfigOptionsUpdate(sessionId),
      });
  }

  private createOnModeChange(sessionId: string) {
    return async (newMode: TwigExecutionMode) => {
      if (this.session) {
        this.session.permissionMode = newMode;
      }
      await this.emitConfigOptionsUpdate(sessionId);
    };
  }

  private async buildConfigOptions(modelOptionsOverride?: {
    currentModelId: string;
    options: SessionConfigSelectOption[];
  }): Promise<SessionConfigOption[]> {
    const options: SessionConfigOption[] = [];

    const modeOptions = getAvailableModes().map((mode) => ({
      value: mode.id,
      name: mode.name,
      description: mode.description ?? undefined,
    }));

    options.push({
      id: "mode",
      name: "Approval Preset",
      type: "select",
      currentValue: this.session.permissionMode,
      options: modeOptions,
      category: "mode" as SessionConfigOptionCategory,
      description: "Choose an approval and sandboxing preset for your session",
    });

    const modelOptions =
      modelOptionsOverride ??
      (await this.getModelConfigOptions(this.session.modelId));
    this.session.modelId = modelOptions.currentModelId;

    options.push({
      id: "model",
      name: "Model",
      type: "select",
      currentValue: modelOptions.currentModelId,
      options: modelOptions.options,
      category: "model" as SessionConfigOptionCategory,
      description: "Choose which model Claude should use",
    });

    return options;
  }

  private async emitConfigOptionsUpdate(sessionId?: string): Promise<void> {
    const configOptions = await this.buildConfigOptions();
    const serialized = JSON.stringify(configOptions);
    if (
      this.lastSentConfigOptions &&
      JSON.stringify(this.lastSentConfigOptions) === serialized
    ) {
      return;
    }

    this.lastSentConfigOptions = configOptions;
    await this.client.sessionUpdate({
      sessionId: sessionId ?? this.sessionId,
      update: {
        sessionUpdate: "config_option_update",
        configOptions,
      },
    });
  }

  private checkAuthStatus() {
    const backupExists = fs.existsSync(
      path.resolve(os.homedir(), ".claude.json.backup"),
    );
    const configExists = fs.existsSync(
      path.resolve(os.homedir(), ".claude.json"),
    );
    if (backupExists && !configExists) {
      throw RequestError.authRequired();
    }
  }

  private async trySetModel(q: Query, modelId: string) {
    try {
      await this.setModelWithFallback(q, modelId);
    } catch (err) {
      this.logger.warn("Failed to set model", { modelId, error: err });
    }
  }

  private async setModelWithFallback(q: Query, modelId: string): Promise<void> {
    const sdkModelId = toSdkModelId(modelId);
    try {
      await q.setModel(sdkModelId);
    } catch (err) {
      if (sdkModelId === modelId) {
        throw err;
      }
      // Fallback to raw gateway ID if SDK model ID failed
      await q.setModel(modelId);
    }
  }

  /**
   * Fire-and-forget: fetch slash commands and MCP tool metadata in parallel.
   * Both populate caches used later — neither is needed to return configOptions.
   */
  private deferBackgroundFetches(q: Query, sessionId: string): void {
    Promise.all([
      getAvailableSlashCommands(q),
      fetchMcpToolMetadata(q, this.logger),
    ])
      .then(([slashCommands]) => {
        this.sendAvailableCommandsUpdate(sessionId, slashCommands);
      })
      .catch((err) => {
        this.logger.warn("Failed to fetch deferred session data", { err });
      });
  }

  private sendAvailableCommandsUpdate(
    sessionId: string,
    availableCommands: AvailableCommand[],
  ) {
    setTimeout(() => {
      this.client.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "available_commands_update",
          availableCommands,
        },
      });
    }, 0);
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

  private async processMessages(sessionId: string): Promise<PromptResponse> {
    const supportsTerminalOutput =
      (this.clientCapabilities?._meta as Record<string, unknown> | undefined)
        ?.terminal_output === true;

    const context = {
      session: this.session,
      sessionId,
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
          return this.handleSessionEnd();
        }

        const response = await this.handleMessage(message, context);
        if (response) {
          return response;
        }
      }
    } finally {
      this.session.promptRunning = false;
      this.resolveNextPendingMessage();
    }
  }

  private resolveNextPendingMessage(): void {
    if (this.session.pendingMessages.size === 0) return;

    let nextEntry: { uuid: string; order: number } | undefined;
    for (const [uuid, pending] of this.session.pendingMessages) {
      if (!nextEntry || pending.order < nextEntry.order) {
        nextEntry = { uuid, order: pending.order };
      }
    }

    if (nextEntry) {
      const pending = this.session.pendingMessages.get(nextEntry.uuid);
      this.session.pendingMessages.delete(nextEntry.uuid);
      pending?.resolve(false);
    }
  }

  private handleSessionEnd(): PromptResponse {
    if (this.session.cancelled) {
      return {
        stopReason: "cancelled",
        _meta: this.session.interruptReason
          ? { interruptReason: this.session.interruptReason }
          : undefined,
      };
    }
    throw new Error("Session did not end in result");
  }

  private async handleMessage(
    message: SDKMessage,
    context: Parameters<typeof handleSystemMessage>[1],
  ): Promise<PromptResponse | null> {
    switch (message.type) {
      case "system":
        await handleSystemMessage(message, context);
        return null;

      case "result": {
        const result = handleResultMessage(message, context);
        if (result.usage) {
          this.session.accumulatedUsage.inputTokens += result.usage.inputTokens;
          this.session.accumulatedUsage.outputTokens +=
            result.usage.outputTokens;
          this.session.accumulatedUsage.cachedReadTokens +=
            result.usage.cachedReadTokens;
          this.session.accumulatedUsage.cachedWriteTokens +=
            result.usage.cachedWriteTokens;

          await this.client.extNotification("_posthog/usage_update", {
            sessionId: context.sessionId,
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
        if (result.shouldStop) {
          return {
            stopReason: result.stopReason as "end_turn" | "max_turn_requests",
            _meta: {
              usage: this.session.accumulatedUsage,
            },
          };
        }
        return null;
      }

      case "stream_event":
        await handleStreamEvent(message, context);
        return null;

      case "user":
      case "assistant": {
        const result = await handleUserAssistantMessage(message, context);
        if (result.error) throw result.error;
        if (result.shouldStop) {
          return { stopReason: "end_turn" };
        }
        return null;
      }

      case "tool_progress":
      case "auth_status":
      case "tool_use_summary":
        return null;

      default:
        // SDKMessage union includes undefined types (SDKRateLimitEvent, SDKPromptSuggestionMessage)
        // that resolve to `any`, preventing exhaustive narrowing
        unreachable(message as never, this.logger);
        return null;
    }
  }
}
