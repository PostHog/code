/**
 * In-process ACP proxy agent for Codex.
 *
 * Implements the ACP Agent interface and delegates to the codex-acp binary
 * via a ClientSideConnection. This gives us interception points for:
 * - PostHog-specific notifications (sdk_session, usage_update, turn_complete)
 * - Session resume/fork (not natively supported by codex-acp)
 * - Usage accumulation
 * - System prompt injection
 */

import {
  type AgentSideConnection,
  type AuthenticateRequest,
  ClientSideConnection,
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
  ndJsonStream,
  type PromptRequest,
  type PromptResponse,
  type ResumeSessionRequest,
  type ResumeSessionResponse,
  type SetSessionConfigOptionRequest,
  type SetSessionConfigOptionResponse,
  type SetSessionModeRequest,
  type SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import packageJson from "../../../package.json" with { type: "json" };
import { POSTHOG_NOTIFICATIONS } from "../../acp-extensions";
import {
  type CodeExecutionMode,
  type CodexNativeMode,
  isCodeExecutionMode,
  isCodexNativeMode,
  type PermissionMode,
} from "../../execution-mode";
import type { ProcessSpawnedCallback } from "../../types";
import { Logger } from "../../utils/logger";
import {
  nodeReadableToWebReadable,
  nodeWritableToWebWritable,
} from "../../utils/streams";
import { BaseAcpAgent, type BaseSession } from "../base-acp-agent";
import { createCodexClient } from "./codex-client";
import {
  type CodexSessionState,
  createSessionState,
  resetUsage,
} from "./session-state";
import { CodexSettingsManager } from "./settings";
import {
  type CodexProcess,
  type CodexProcessOptions,
  spawnCodexProcess,
} from "./spawn";

interface NewSessionMeta {
  taskRunId?: string;
  taskId?: string;
  systemPrompt?: string;
  permissionMode?: string;
  model?: string;
  persistence?: { taskId?: string; runId?: string; logUrl?: string };
  claudeCode?: {
    options?: Record<string, unknown>;
  };
  additionalRoots?: string[];
  disableBuiltInTools?: boolean;
  allowedDomains?: string[];
}

export interface CodexAcpAgentOptions {
  codexProcessOptions: CodexProcessOptions;
  processCallbacks?: ProcessSpawnedCallback;
}

type CodexSession = BaseSession & {
  settingsManager: CodexSettingsManager;
};

function toCodexPermissionMode(mode?: string): PermissionMode {
  if (mode && (isCodexNativeMode(mode) || isCodeExecutionMode(mode))) {
    return mode;
  }
  return "auto";
}

/**
 * Prepend `_meta.prContext` (set by the agent-server on Slack-originated
 * follow-up runs) to the prompt as a text block, mirroring Claude's
 * `promptToClaude` behavior. Without this, codex cloud runs lose the
 * PR-review context that follow-up flows rely on.
 */
function prependPrContext(params: PromptRequest): PromptRequest {
  const prContext = (params._meta as Record<string, unknown> | undefined)
    ?.prContext;
  if (typeof prContext !== "string" || prContext.length === 0) {
    return params;
  }
  return {
    ...params,
    prompt: [{ type: "text", text: prContext }, ...params.prompt],
  };
}

const CODEX_NATIVE_MODE: Record<CodeExecutionMode, CodexNativeMode> = {
  default: "auto",
  acceptEdits: "auto",
  plan: "read-only",
  bypassPermissions: "full-access",
};

function toCodexNativeMode(mode?: string): CodexNativeMode {
  if (mode && isCodexNativeMode(mode)) {
    return mode;
  }
  if (mode && isCodeExecutionMode(mode)) {
    return CODEX_NATIVE_MODE[mode];
  }
  return "auto";
}

function getCurrentPermissionMode(
  currentModeId?: string,
  fallbackMode?: string,
): PermissionMode {
  if (currentModeId && isCodexNativeMode(currentModeId)) {
    return currentModeId;
  }

  return toCodexPermissionMode(fallbackMode);
}

export class CodexAcpAgent extends BaseAcpAgent {
  readonly adapterName = "codex";
  declare session: CodexSession;
  private codexProcess: CodexProcess;
  private codexConnection: ClientSideConnection;
  private sessionState: CodexSessionState;

  constructor(client: AgentSideConnection, options: CodexAcpAgentOptions) {
    super(client);
    this.logger = new Logger({ debug: true, prefix: "[CodexAcpAgent]" });

    // Load user codex settings before spawning so spawnCodexProcess can
    // filter out any [mcp_servers.*] entries from ~/.codex/config.toml.
    const cwd = options.codexProcessOptions.cwd ?? process.cwd();
    const settingsManager = new CodexSettingsManager(cwd);

    // Spawn the codex-acp subprocess
    this.codexProcess = spawnCodexProcess({
      ...options.codexProcessOptions,
      settings: settingsManager.getSettings(),
      logger: this.logger,
      processCallbacks: options.processCallbacks,
    });

    // Create ACP connection to codex-acp over stdin/stdout
    const codexReadable = nodeReadableToWebReadable(this.codexProcess.stdout);
    const codexWritable = nodeWritableToWebWritable(this.codexProcess.stdin);
    const codexStream = ndJsonStream(codexWritable, codexReadable);

    const abortController = new AbortController();
    this.session = {
      abortController,
      settingsManager,
      notificationHistory: [],
      cancelled: false,
    };

    this.sessionState = createSessionState("", cwd);

    // Create the ClientSideConnection to codex-acp.
    // The Client handler delegates all requests from codex-acp to the upstream
    // PostHog Code client via our AgentSideConnection.
    this.codexConnection = new ClientSideConnection(
      (_agent) =>
        createCodexClient(this.client, this.logger, this.sessionState),
      codexStream,
    );
  }

  async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    // Initialize settings
    await this.session.settingsManager.initialize();

    // Forward to codex-acp
    const response = await this.codexConnection.initialize(request);

    // Merge our enhanced capabilities
    return {
      ...response,
      agentCapabilities: {
        ...response.agentCapabilities,
        sessionCapabilities: {
          ...response.agentCapabilities?.sessionCapabilities,
          resume: {},
          fork: {},
        },
        _meta: {
          posthog: {
            resumeSession: true,
          },
        },
      },
      agentInfo: {
        name: packageJson.name,
        title: "Codex Agent",
        version: packageJson.version,
      },
    };
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const meta = params._meta as NewSessionMeta | undefined;
    const requestedPermissionMode = toCodexPermissionMode(meta?.permissionMode);

    const response = await this.codexConnection.newSession(params);

    // Initialize session state
    this.sessionState = createSessionState(response.sessionId, params.cwd, {
      taskRunId: meta?.taskRunId,
      taskId: meta?.taskId ?? meta?.persistence?.taskId,
      modeId: response.modes?.currentModeId ?? "auto",
      modelId: response.models?.currentModelId,
      permissionMode: requestedPermissionMode,
    });
    this.sessionId = response.sessionId;
    this.sessionState.configOptions = response.configOptions ?? [];

    await this.applyInitialPermissionMode(
      response.sessionId,
      meta?.permissionMode,
      response.modes?.currentModeId,
    );

    // Emit _posthog/sdk_session so the app can track the session
    if (meta?.taskRunId) {
      await this.client.extNotification(POSTHOG_NOTIFICATIONS.SDK_SESSION, {
        taskRunId: meta.taskRunId,
        sessionId: response.sessionId,
        adapter: "codex",
      });
    }

    this.logger.info("Codex session created", {
      sessionId: response.sessionId,
      taskRunId: meta?.taskRunId,
    });

    return response;
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    const response = await this.codexConnection.loadSession(params);
    const meta = params._meta as NewSessionMeta | undefined;
    const currentPermissionMode = getCurrentPermissionMode(
      response.modes?.currentModeId,
      meta?.permissionMode,
    );

    this.sessionState = createSessionState(params.sessionId, params.cwd, {
      modeId: response.modes?.currentModeId ?? "auto",
      permissionMode: currentPermissionMode,
    });
    this.sessionId = params.sessionId;
    this.sessionState.configOptions = response.configOptions ?? [];

    return response;
  }

  async unstable_resumeSession(
    params: ResumeSessionRequest,
  ): Promise<ResumeSessionResponse> {
    // codex-acp doesn't support resume natively, use loadSession instead
    const loadResponse = await this.codexConnection.loadSession({
      sessionId: params.sessionId,
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
    });

    const meta = params._meta as NewSessionMeta | undefined;
    const currentPermissionMode = getCurrentPermissionMode(
      loadResponse.modes?.currentModeId,
      meta?.permissionMode,
    );
    this.sessionState = createSessionState(params.sessionId, params.cwd, {
      taskRunId: meta?.taskRunId,
      taskId: meta?.taskId ?? meta?.persistence?.taskId,
      modeId: loadResponse.modes?.currentModeId ?? "auto",
      permissionMode: currentPermissionMode,
    });
    this.sessionId = params.sessionId;
    this.sessionState.configOptions = loadResponse.configOptions ?? [];

    if (meta?.taskRunId) {
      await this.client.extNotification(POSTHOG_NOTIFICATIONS.SDK_SESSION, {
        taskRunId: meta.taskRunId,
        sessionId: params.sessionId,
        adapter: "codex",
      });
    }

    return {
      modes: loadResponse.modes,
      models: loadResponse.models,
      configOptions: loadResponse.configOptions,
    };
  }

  async unstable_forkSession(
    params: ForkSessionRequest,
  ): Promise<ForkSessionResponse> {
    // Create a new session via codex-acp (fork isn't natively supported)
    const newResponse = await this.codexConnection.newSession({
      cwd: params.cwd,
      mcpServers: params.mcpServers ?? [],
      _meta: params._meta,
    });

    const meta = params._meta as NewSessionMeta | undefined;
    const requestedPermissionMode = toCodexPermissionMode(meta?.permissionMode);
    this.sessionState = createSessionState(newResponse.sessionId, params.cwd, {
      taskRunId: meta?.taskRunId,
      taskId: meta?.taskId ?? meta?.persistence?.taskId,
      modeId: newResponse.modes?.currentModeId ?? "auto",
      permissionMode: requestedPermissionMode,
    });
    this.sessionId = newResponse.sessionId;
    this.sessionState.configOptions = newResponse.configOptions ?? [];

    await this.applyInitialPermissionMode(
      newResponse.sessionId,
      meta?.permissionMode,
      newResponse.modes?.currentModeId,
    );

    return newResponse;
  }

  private async applyInitialPermissionMode(
    sessionId: string,
    permissionMode?: string,
    currentModeId?: string,
  ): Promise<void> {
    if (!permissionMode) {
      return;
    }

    const nativeMode = toCodexNativeMode(permissionMode);
    if (nativeMode === currentModeId) {
      this.sessionState.modeId = nativeMode;
      this.sessionState.permissionMode = toCodexPermissionMode(permissionMode);
      return;
    }

    await this.codexConnection.setSessionMode({
      sessionId,
      modeId: nativeMode,
    });
    this.sessionState.modeId = nativeMode;
    this.sessionState.permissionMode = toCodexPermissionMode(permissionMode);
  }

  async listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    return this.codexConnection.listSessions(params);
  }

  async unstable_listSessions(
    params: ListSessionsRequest,
  ): Promise<ListSessionsResponse> {
    return this.listSessions(params);
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.session.cancelled = false;
    this.session.interruptReason = undefined;
    resetUsage(this.sessionState);

    // codex-acp does not echo the user prompt back on the agent→client
    // channel, so without this broadcast the tapped stream (persisted to S3
    // and rendered by the PostHog web UI) never sees a user turn and only
    // the assistant reply shows up. Mirrors ClaudeAcpAgent.broadcastUserMessage.
    // The original params (no _meta.prContext prefix) is broadcast so the
    // injected PR context is not rendered as a user message.
    await this.broadcastUserMessage(params);

    const response = await this.codexConnection.prompt(
      prependPrContext(params),
    );

    // Usage is already accumulated via sessionUpdate notifications in
    // codex-client.ts. Do NOT also add response.usage here or tokens
    // get double-counted.

    if (this.sessionState.taskRunId) {
      const { accumulatedUsage } = this.sessionState;

      await this.client.extNotification(POSTHOG_NOTIFICATIONS.TURN_COMPLETE, {
        sessionId: params.sessionId,
        stopReason: response.stopReason ?? "end_turn",
        usage: {
          inputTokens: accumulatedUsage.inputTokens,
          outputTokens: accumulatedUsage.outputTokens,
          cachedReadTokens: accumulatedUsage.cachedReadTokens,
          cachedWriteTokens: accumulatedUsage.cachedWriteTokens,
          totalTokens:
            accumulatedUsage.inputTokens +
            accumulatedUsage.outputTokens +
            accumulatedUsage.cachedReadTokens +
            accumulatedUsage.cachedWriteTokens,
        },
      });

      if (response.usage) {
        await this.client.extNotification(POSTHOG_NOTIFICATIONS.USAGE_UPDATE, {
          sessionId: params.sessionId,
          used: {
            inputTokens: response.usage.inputTokens ?? 0,
            outputTokens: response.usage.outputTokens ?? 0,
            cachedReadTokens: response.usage.cachedReadTokens ?? 0,
            cachedWriteTokens: response.usage.cachedWriteTokens ?? 0,
          },
          cost: null,
        });
      }
    }

    return response;
  }

  protected async interrupt(): Promise<void> {
    await this.codexConnection.cancel({
      sessionId: this.sessionId,
    });
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

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    const requestedMode = toCodexPermissionMode(params.modeId);
    const nativeMode = toCodexNativeMode(params.modeId);

    const response = await this.codexConnection.setSessionMode({
      ...params,
      modeId: nativeMode,
    });

    this.sessionState.modeId = nativeMode;
    this.sessionState.permissionMode = requestedMode;
    return response ?? {};
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest,
  ): Promise<SetSessionConfigOptionResponse> {
    const response = await this.codexConnection.setSessionConfigOption(params);
    if (response.configOptions) {
      this.sessionState.configOptions = response.configOptions;
    }
    return response;
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    // Auth handled externally
  }

  async closeSession(): Promise<void> {
    this.logger.info("Closing Codex session", { sessionId: this.sessionId });
    this.session.abortController.abort();
    this.session.settingsManager.dispose();
    try {
      this.codexProcess.kill();
    } catch (err) {
      this.logger.warn("Failed to kill codex-acp process", { error: err });
    }
  }
}
