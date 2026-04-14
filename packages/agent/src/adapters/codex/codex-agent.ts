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
  CODE_EXECUTION_MODES,
  type CodeExecutionMode,
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

function toCodeExecutionMode(mode?: string): CodeExecutionMode {
  if (mode && (CODE_EXECUTION_MODES as readonly string[]).includes(mode)) {
    return mode as CodeExecutionMode;
  }
  return "default";
}

const CODEX_NATIVE_MODE: Record<CodeExecutionMode, string> = {
  default: "default",
  acceptEdits: "default",
  plan: "plan",
  bypassPermissions: "default",
};

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

    const response = await this.codexConnection.newSession(params);

    // Initialize session state
    this.sessionState = createSessionState(response.sessionId, params.cwd, {
      taskRunId: meta?.taskRunId,
      taskId: meta?.taskId ?? meta?.persistence?.taskId,
      modeId: response.modes?.currentModeId ?? "default",
      modelId: response.models?.currentModelId,
      permissionMode: toCodeExecutionMode(meta?.permissionMode),
    });
    this.sessionId = response.sessionId;
    this.sessionState.configOptions = response.configOptions ?? [];

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

    this.sessionState = createSessionState(params.sessionId, params.cwd, {
      permissionMode: toCodeExecutionMode(meta?.permissionMode),
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
    this.sessionState = createSessionState(params.sessionId, params.cwd, {
      taskRunId: meta?.taskRunId,
      taskId: meta?.taskId ?? meta?.persistence?.taskId,
      permissionMode: toCodeExecutionMode(meta?.permissionMode),
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
    this.sessionState = createSessionState(newResponse.sessionId, params.cwd, {
      taskRunId: meta?.taskRunId,
      taskId: meta?.taskId ?? meta?.persistence?.taskId,
      permissionMode: toCodeExecutionMode(meta?.permissionMode),
    });
    this.sessionId = newResponse.sessionId;
    this.sessionState.configOptions = newResponse.configOptions ?? [];

    return newResponse;
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

    const response = await this.codexConnection.prompt(params);

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

  async setSessionMode(
    params: SetSessionModeRequest,
  ): Promise<SetSessionModeResponse> {
    const requestedMode = toCodeExecutionMode(params.modeId);
    const nativeMode = CODEX_NATIVE_MODE[requestedMode];

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
