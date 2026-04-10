import type {
  ContentBlock,
  RequestPermissionRequest,
  SessionConfigOption,
} from "@agentclientprotocol/sdk";
import {
  createAuthenticatedClient,
  getAuthenticatedClient,
} from "@features/auth/hooks/authClient";
import { fetchAuthState } from "@features/auth/hooks/authQueries";
import {
  buildCloudPromptBlocks,
  buildCloudTaskDescription,
  serializeCloudPrompt,
} from "@features/editor/utils/cloud-prompt";
import { useSessionAdapterStore } from "@features/sessions/stores/sessionAdapterStore";
import {
  getPersistedConfigOptions,
  removePersistedConfigOptions,
  setPersistedConfigOptions,
  updatePersistedConfigOptionValue,
} from "@features/sessions/stores/sessionConfigStore";
import type {
  Adapter,
  AgentSession,
} from "@features/sessions/stores/sessionStore";
import {
  getConfigOptionByCategory,
  mergeConfigOptions,
  sessionStoreSetters,
} from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { taskViewedApi } from "@features/sidebar/hooks/useTaskViewed";
import { isNotification, POSTHOG_NOTIFICATIONS } from "@posthog/agent";
import { DEFAULT_GATEWAY_MODEL } from "@posthog/agent/gateway-models";
import { getIsOnline } from "@renderer/stores/connectivityStore";
import { trpcClient } from "@renderer/trpc/client";
import { getGhUserTokenOrThrow } from "@renderer/utils/github";
import { toast } from "@renderer/utils/toast";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import {
  type CloudTaskUpdatePayload,
  type EffortLevel,
  type ExecutionMode,
  effortLevelSchema,
  isTerminalStatus,
  type Task,
} from "@shared/types";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import type { CloudRunSource, PrAuthorshipMode } from "@shared/types/cloud";
import type { AcpMessage, StoredLogEntry } from "@shared/types/session-events";
import { isJsonRpcRequest } from "@shared/types/session-events";
import { buildPermissionToolMetadata, track } from "@utils/analytics";
import { logger } from "@utils/logger";
import {
  notifyPermissionRequest,
  notifyPromptComplete,
} from "@utils/notifications";
import { queryClient } from "@utils/queryClient";
import {
  convertStoredEntriesToEvents,
  createUserMessageEvent,
  createUserShellExecuteEvent,
  extractPromptText,
  getUserShellExecutesSinceLastPrompt,
  isFatalSessionError,
  normalizePromptToBlocks,
  shellExecutesToContextBlocks,
} from "@utils/session";

const log = logger.scope("session-service");

interface AuthCredentials {
  apiHost: string;
  projectId: number;
  client: Awaited<ReturnType<typeof getAuthenticatedClient>>;
}

export interface ConnectParams {
  task: Task;
  repoPath: string;
  initialPrompt?: ContentBlock[];
  executionMode?: ExecutionMode;
  adapter?: "claude" | "codex";
  model?: string;
  reasoningLevel?: string;
}

// --- Singleton Service Instance ---

let serviceInstance: SessionService | null = null;

export function getSessionService(): SessionService {
  if (!serviceInstance) {
    serviceInstance = new SessionService();
  }
  return serviceInstance;
}

export function resetSessionService(): void {
  if (serviceInstance) {
    serviceInstance.reset();
    serviceInstance = null;
  }

  sessionStoreSetters.clearAll();

  trpcClient.agent.resetAll.mutate().catch((err) => {
    log.error("Failed to reset all sessions on main process", err);
  });
}

export class SessionService {
  private connectingTasks = new Map<string, Promise<void>>();
  private nextCloudTaskWatchToken = 0;
  private subscriptions = new Map<
    string,
    {
      event: { unsubscribe: () => void };
      permission?: { unsubscribe: () => void };
    }
  >();
  /** Active cloud task watchers, keyed by taskId */
  private cloudTaskWatchers = new Map<
    string,
    {
      runId: string;
      apiHost: string;
      teamId: number;
      startToken: number;
      subscription: { unsubscribe: () => void };
      onStatusChange?: () => void;
    }
  >();
  private idleKilledSubscription: { unsubscribe: () => void } | null = null;

  constructor() {
    this.idleKilledSubscription =
      trpcClient.agent.onSessionIdleKilled.subscribe(undefined, {
        onData: (event: { taskRunId: string }) => {
          const { taskRunId } = event;
          log.info("Session idle-killed by main process", { taskRunId });
          this.handleIdleKill(taskRunId);
        },
        onError: (err: unknown) => {
          log.debug("Idle-killed subscription error", { error: err });
        },
      });
  }

  /**
   * Connect to a task session.
   * Uses locking to prevent duplicate concurrent connections.
   */
  async connectToTask(params: ConnectParams): Promise<void> {
    const { task } = params;
    const taskId = task.id;

    log.info("Connecting to task", { taskId });

    // Return existing connection promise if already connecting
    const existingPromise = this.connectingTasks.get(taskId);
    if (existingPromise) {
      log.info("Already connecting to task, returning existing promise", {
        taskId,
      });
      return existingPromise;
    }

    // Check for existing connected session
    const existingSession = sessionStoreSetters.getSessionByTaskId(taskId);
    if (existingSession?.status === "connected") {
      log.info("Already connected to task", { taskId });
      return;
    }
    if (existingSession?.status === "connecting") {
      log.info("Session already in connecting state", { taskId });
      return;
    }

    // Create and store the connection promise
    const connectPromise = this.doConnect(params).finally(() => {
      this.connectingTasks.delete(taskId);
    });
    this.connectingTasks.set(taskId, connectPromise);

    return connectPromise;
  }

  private async doConnect(params: ConnectParams): Promise<void> {
    const {
      task,
      repoPath,
      initialPrompt,
      executionMode,
      adapter,
      model,
      reasoningLevel,
    } = params;
    const { id: taskId, latest_run: latestRun } = task;
    const taskTitle = task.title || task.description || "Task";

    try {
      const auth = await this.getAuthCredentials();
      if (!auth) {
        log.error("Missing auth credentials");
        const taskRunId = latestRun?.id ?? `error-${taskId}`;
        const session = this.createBaseSession(taskRunId, taskId, taskTitle);
        session.status = "error";
        session.errorMessage =
          "Authentication required. Please sign in to continue.";
        if (initialPrompt?.length) {
          session.initialPrompt = initialPrompt;
        }
        sessionStoreSetters.setSession(session);
        return;
      }

      if (latestRun?.id && latestRun?.log_url) {
        if (!getIsOnline()) {
          log.info("Skipping connection attempt - offline", { taskId });
          const { rawEntries } = await this.fetchSessionLogs(
            latestRun.log_url,
            latestRun.id,
          );
          const events = convertStoredEntriesToEvents(rawEntries);
          const session = this.createBaseSession(
            latestRun.id,
            taskId,
            taskTitle,
          );
          session.events = events;
          session.logUrl = latestRun.log_url;
          session.status = "disconnected";
          session.errorMessage =
            "No internet connection. Connect when you're back online.";
          sessionStoreSetters.setSession(session);
          return;
        }

        const [workspaceResult, logResult] = await Promise.all([
          trpcClient.workspace.verify.query({ taskId }),
          this.fetchSessionLogs(latestRun.log_url, latestRun.id),
        ]);

        if (!workspaceResult.exists) {
          log.warn("Workspace no longer exists, showing error state", {
            taskId,
            missingPath: workspaceResult.missingPath,
          });
          const events = convertStoredEntriesToEvents(logResult.rawEntries);
          const session = this.createBaseSession(
            latestRun.id,
            taskId,
            taskTitle,
          );
          session.events = events;
          session.logUrl = latestRun.log_url;
          session.status = "error";
          session.errorMessage = workspaceResult.missingPath
            ? `Working directory no longer exists: ${workspaceResult.missingPath}`
            : "The working directory for this task no longer exists. Please start a new session.";
          sessionStoreSetters.setSession(session);
          return;
        }

        await this.reconnectToLocalSession(
          taskId,
          latestRun.id,
          taskTitle,
          latestRun.log_url,
          repoPath,
          auth,
          logResult,
        );
      } else {
        if (!getIsOnline()) {
          log.info("Skipping connection attempt - offline", { taskId });
          const taskRunId = latestRun?.id ?? `offline-${taskId}`;
          const session = this.createBaseSession(taskRunId, taskId, taskTitle);
          session.status = "disconnected";
          session.errorMessage =
            "No internet connection. Connect when you're back online.";
          sessionStoreSetters.setSession(session);
          return;
        }

        await this.createNewLocalSession(
          taskId,
          taskTitle,
          repoPath,
          auth,
          initialPrompt,
          executionMode,
          adapter,
          model,
          reasoningLevel,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error("Failed to connect to task", { message });

      const taskRunId = latestRun?.id ?? `error-${taskId}`;
      const session = this.createBaseSession(taskRunId, taskId, taskTitle);
      session.status = "error";
      session.errorTitle = "Failed to connect";
      session.errorMessage = message;
      if (initialPrompt?.length) {
        session.initialPrompt = initialPrompt;
      }

      if (latestRun?.log_url) {
        try {
          const { rawEntries } = await this.fetchSessionLogs(
            latestRun.log_url,
            latestRun.id,
          );
          session.events = convertStoredEntriesToEvents(rawEntries);
          session.logUrl = latestRun.log_url;
        } catch {
          // Ignore log fetch errors
        }
      }

      sessionStoreSetters.setSession(session);
    }
  }

  private async reconnectToLocalSession(
    taskId: string,
    taskRunId: string,
    taskTitle: string,
    logUrl: string | undefined,
    repoPath: string,
    auth: AuthCredentials,
    prefetchedLogs?: {
      rawEntries: StoredLogEntry[];
      sessionId?: string;
      adapter?: Adapter;
    },
  ): Promise<void> {
    const { rawEntries, sessionId, adapter } =
      prefetchedLogs ?? (await this.fetchSessionLogs(logUrl, taskRunId));
    const events = convertStoredEntriesToEvents(rawEntries);

    const storedAdapter = useSessionAdapterStore
      .getState()
      .getAdapter(taskRunId);
    const resolvedAdapter = adapter ?? storedAdapter;

    const persistedConfigOptions = getPersistedConfigOptions(taskRunId);

    const session = this.createBaseSession(taskRunId, taskId, taskTitle);
    session.events = events;
    if (logUrl) {
      session.logUrl = logUrl;
    }
    if (persistedConfigOptions) {
      session.configOptions = persistedConfigOptions;
    }
    if (resolvedAdapter) {
      session.adapter = resolvedAdapter;
      useSessionAdapterStore.getState().setAdapter(taskRunId, resolvedAdapter);
    }

    sessionStoreSetters.setSession(session);
    this.subscribeToChannel(taskRunId);

    try {
      const modeOpt = getConfigOptionByCategory(persistedConfigOptions, "mode");
      const persistedMode =
        modeOpt?.type === "select" ? modeOpt.currentValue : undefined;

      trpcClient.workspace.verify
        .query({ taskId })
        .then((workspaceResult) => {
          if (!workspaceResult.exists) {
            log.warn("Workspace no longer exists", {
              taskId,
              missingPath: workspaceResult.missingPath,
            });
            sessionStoreSetters.updateSession(taskRunId, {
              status: "error",
              errorMessage: workspaceResult.missingPath
                ? `Working directory no longer exists: ${workspaceResult.missingPath}`
                : "The working directory for this task no longer exists. Please start a new session.",
            });
          }
        })
        .catch((err) => {
          log.warn("Failed to verify workspace", { taskId, err });
        });

      const { customInstructions } = useSettingsStore.getState();
      const result = await trpcClient.agent.reconnect.mutate({
        taskId,
        taskRunId,
        repoPath,
        apiHost: auth.apiHost,
        projectId: auth.projectId,
        logUrl,
        sessionId,
        adapter: resolvedAdapter,
        permissionMode: persistedMode,
        customInstructions: customInstructions || undefined,
      });

      if (result) {
        // Cast and merge live configOptions with persisted values.
        // Fall back to persisted options if the agent doesn't return any
        // (e.g. after session compaction).
        let configOptions = result.configOptions as
          | SessionConfigOption[]
          | undefined;
        if (configOptions && persistedConfigOptions) {
          configOptions = mergeConfigOptions(
            configOptions,
            persistedConfigOptions,
          );
        } else if (!configOptions) {
          configOptions = persistedConfigOptions ?? undefined;
        }

        sessionStoreSetters.updateSession(taskRunId, {
          status: "connected",
          configOptions,
        });

        // Persist the merged config options
        if (configOptions) {
          setPersistedConfigOptions(taskRunId, configOptions);
        }

        // Restore persisted config options to server in parallel
        if (persistedConfigOptions) {
          await Promise.all(
            persistedConfigOptions.map((opt) =>
              trpcClient.agent.setConfigOption
                .mutate({
                  sessionId: taskRunId,
                  configId: opt.id,
                  value: String(opt.currentValue),
                })
                .catch((error) => {
                  log.warn(
                    "Failed to restore persisted config option after reconnect",
                    {
                      taskId,
                      configId: opt.id,
                      error,
                    },
                  );
                }),
            ),
          );
        }
      } else {
        log.warn("Reconnect returned null", { taskId, taskRunId });
        this.setErrorSession(
          taskId,
          taskRunId,
          taskTitle,
          "Session could not be resumed. Please retry or start a new session.",
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      log.warn("Reconnect failed", { taskId, error: errorMessage });
      this.setErrorSession(
        taskId,
        taskRunId,
        taskTitle,
        errorMessage ||
          "Failed to reconnect. Please retry or start a new session.",
      );
    }
  }

  private async teardownSession(taskRunId: string): Promise<void> {
    try {
      await trpcClient.agent.cancel.mutate({ sessionId: taskRunId });
    } catch (error) {
      log.debug("Cancel during teardown failed (session may already be gone)", {
        taskRunId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.unsubscribeFromChannel(taskRunId);
    sessionStoreSetters.removeSession(taskRunId);
    useSessionAdapterStore.getState().removeAdapter(taskRunId);
    removePersistedConfigOptions(taskRunId);
  }

  /**
   * Handle an idle-kill from the main process without destroying session state.
   * The main process already cleaned up the agent, so we only need to
   * unsubscribe from the channel and mark the session as errored.
   * Preserves events, logUrl, configOptions and adapter so that Retry
   * can reconnect with full context via unstable_resumeSession.
   */
  private handleIdleKill(taskRunId: string): void {
    this.unsubscribeFromChannel(taskRunId);
    sessionStoreSetters.updateSession(taskRunId, {
      status: "error",
      errorMessage:
        "Session disconnected due to inactivity. Click Retry to reconnect.",
      isPromptPending: false,
      isCompacting: false,
      promptStartedAt: null,
    });
  }

  private setErrorSession(
    taskId: string,
    taskRunId: string,
    taskTitle: string,
    errorMessage: string,
    errorTitle?: string,
  ): void {
    // Preserve events and logUrl from the existing session so the
    // retry / reset flows can re-hydrate without a fresh log fetch.
    // Note: the error overlay is opaque, so these events aren't visible
    // to the user — they're carried forward for the next reconnect attempt.
    const existing = sessionStoreSetters.getSessionByTaskId(taskId);
    const session = this.createBaseSession(taskRunId, taskId, taskTitle);
    session.status = "error";
    session.errorTitle = errorTitle;
    session.errorMessage = errorMessage;
    if (existing?.events?.length) {
      session.events = existing.events;
    }
    if (existing?.logUrl) {
      session.logUrl = existing.logUrl;
    }
    if (existing?.initialPrompt?.length) {
      session.initialPrompt = existing.initialPrompt;
    }
    sessionStoreSetters.setSession(session);
  }

  private async createNewLocalSession(
    taskId: string,
    taskTitle: string,
    repoPath: string,
    auth: AuthCredentials,
    initialPrompt?: ContentBlock[],
    executionMode?: ExecutionMode,
    adapter?: "claude" | "codex",
    model?: string,
    reasoningLevel?: string,
  ): Promise<void> {
    const { client } = auth;
    if (!client) {
      throw new Error("Unable to reach server. Please check your connection.");
    }

    const taskRun = await client.createTaskRun(taskId);
    if (!taskRun?.id) {
      throw new Error("Failed to create task run. Please try again.");
    }

    const { customInstructions: startCustomInstructions } =
      useSettingsStore.getState();
    const preferredModel = model ?? DEFAULT_GATEWAY_MODEL;
    const result = await trpcClient.agent.start.mutate({
      taskId,
      taskRunId: taskRun.id,
      repoPath,
      apiHost: auth.apiHost,
      projectId: auth.projectId,
      permissionMode: executionMode,
      adapter,
      customInstructions: startCustomInstructions || undefined,
      effort: effortLevelSchema.safeParse(reasoningLevel).success
        ? (reasoningLevel as EffortLevel)
        : undefined,
      model: preferredModel,
    });

    const session = this.createBaseSession(taskRun.id, taskId, taskTitle);
    session.channel = result.channel;
    session.status = "connected";
    session.adapter = adapter;
    const configOptions = result.configOptions as
      | SessionConfigOption[]
      | undefined;
    session.configOptions = configOptions;

    // Persist the config options
    if (configOptions) {
      setPersistedConfigOptions(taskRun.id, configOptions);
    }

    // Persist the adapter
    if (adapter) {
      useSessionAdapterStore.getState().setAdapter(taskRun.id, adapter);
    }

    // Store the initial prompt on the session so retry/reset flows can
    // re-send it if the session errors after this point (e.g. subscription
    // error, agent crash, or prompt failure).
    if (initialPrompt?.length) {
      session.initialPrompt = initialPrompt;
    }

    sessionStoreSetters.setSession(session);
    this.subscribeToChannel(taskRun.id);

    track(ANALYTICS_EVENTS.TASK_RUN_STARTED, {
      task_id: taskId,
      execution_type: "local",
      initial_mode: executionMode,
      adapter,
    });

    if (initialPrompt?.length) {
      await this.sendPrompt(taskId, initialPrompt);
    }
  }

  async loadLogsOnly(params: {
    taskId: string;
    taskRunId: string;
    taskTitle: string;
    logUrl: string;
  }): Promise<void> {
    const { taskId, taskRunId, taskTitle, logUrl } = params;
    const existing = sessionStoreSetters.getSessionByTaskId(taskId);
    if (existing && existing.events.length > 0) return;

    const { rawEntries } = await this.fetchSessionLogs(logUrl, taskRunId);
    const events = convertStoredEntriesToEvents(rawEntries);
    const session = this.createBaseSession(taskRunId, taskId, taskTitle);
    session.events = events;
    session.logUrl = logUrl;
    session.status = "disconnected";
    sessionStoreSetters.setSession(session);
  }

  async disconnectFromTask(taskId: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    await this.teardownSession(session.taskRunId);
  }

  // --- Subscription Management ---

  private subscribeToChannel(taskRunId: string): void {
    if (this.subscriptions.has(taskRunId)) {
      return;
    }

    const eventSubscription = trpcClient.agent.onSessionEvent.subscribe(
      { taskRunId },
      {
        onData: (payload: unknown) => {
          this.handleSessionEvent(taskRunId, payload as AcpMessage);
        },
        onError: (err) => {
          log.error("Session subscription error", { taskRunId, error: err });
          sessionStoreSetters.updateSession(taskRunId, {
            status: "error",
            errorMessage:
              "Lost connection to the agent. Please restart the task.",
          });
        },
      },
    );

    const permissionSubscription =
      trpcClient.agent.onPermissionRequest.subscribe(
        { taskRunId },
        {
          onData: async (payload) => {
            this.handlePermissionRequest(taskRunId, payload);
          },
          onError: (err) => {
            log.error("Permission subscription error", {
              taskRunId,
              error: err,
            });
          },
        },
      );

    this.subscriptions.set(taskRunId, {
      event: eventSubscription,
      permission: permissionSubscription,
    });
  }

  private unsubscribeFromChannel(taskRunId: string): void {
    const subscription = this.subscriptions.get(taskRunId);
    subscription?.event.unsubscribe();
    subscription?.permission?.unsubscribe();
    this.subscriptions.delete(taskRunId);
  }

  /**
   * Reset all service state and clean up subscriptions.
   * Called on logout or app reset.
   */
  reset(): void {
    log.info("Resetting session service", {
      subscriptionCount: this.subscriptions.size,
      connectingCount: this.connectingTasks.size,
      cloudWatcherCount: this.cloudTaskWatchers.size,
    });

    // Unsubscribe from all active subscriptions
    for (const taskRunId of this.subscriptions.keys()) {
      this.unsubscribeFromChannel(taskRunId);
    }

    // Clean up all cloud task watchers
    for (const taskId of [...this.cloudTaskWatchers.keys()]) {
      this.stopCloudTaskWatch(taskId);
    }

    this.connectingTasks.clear();
    this.idleKilledSubscription?.unsubscribe();
    this.idleKilledSubscription = null;
  }

  private updatePromptStateFromEvents(
    taskRunId: string,
    events: AcpMessage[],
  ): void {
    for (const acpMsg of events) {
      const msg = acpMsg.message;
      if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
        sessionStoreSetters.updateSession(taskRunId, {
          isPromptPending: true,
          promptStartedAt: acpMsg.ts,
          pausedDurationMs: 0,
        });
      }
      if (
        "id" in msg &&
        "result" in msg &&
        typeof msg.result === "object" &&
        msg.result !== null &&
        "stopReason" in msg.result
      ) {
        sessionStoreSetters.updateSession(taskRunId, {
          isPromptPending: false,
          promptStartedAt: null,
        });
      }
    }
  }

  private handleSessionEvent(taskRunId: string, acpMsg: AcpMessage): void {
    const session = sessionStoreSetters.getSessions()[taskRunId];
    if (!session) return;

    const isUserPromptEcho =
      isJsonRpcRequest(acpMsg.message) &&
      acpMsg.message.method === "session/prompt";

    // Once the agent starts responding, clear initialPrompt so that
    // retry reconnects to this session instead of creating a new one.
    if (!isUserPromptEcho && session.initialPrompt?.length) {
      sessionStoreSetters.updateSession(taskRunId, {
        initialPrompt: undefined,
      });
    }

    if (isUserPromptEcho) {
      sessionStoreSetters.replaceOptimisticWithEvent(taskRunId, acpMsg);
    } else {
      sessionStoreSetters.appendEvents(taskRunId, [acpMsg]);
    }
    this.updatePromptStateFromEvents(taskRunId, [acpMsg]);

    const msg = acpMsg.message;

    if (
      "id" in msg &&
      "result" in msg &&
      typeof msg.result === "object" &&
      msg.result !== null &&
      "stopReason" in msg.result
    ) {
      const stopReason = (msg.result as { stopReason?: string }).stopReason;
      const hasQueuedMessages = this.drainQueuedMessages(taskRunId, session);

      // Only notify when queue is empty - queued messages will start a new turn
      if (stopReason && !hasQueuedMessages) {
        notifyPromptComplete(session.taskTitle, stopReason, session.taskId);
      }

      taskViewedApi.markActivity(session.taskId);
    }

    if ("method" in msg && msg.method === "session/update" && "params" in msg) {
      const params = msg.params as {
        update?: {
          sessionUpdate?: string;
          configOptions?: SessionConfigOption[];
        };
      };

      // Handle config option updates (replaces current_mode_update)
      if (
        params?.update?.sessionUpdate === "config_option_update" &&
        params.update.configOptions
      ) {
        const configOptions = params.update.configOptions;
        sessionStoreSetters.updateSession(taskRunId, {
          configOptions,
        });
        // Persist the updated config options
        setPersistedConfigOptions(taskRunId, configOptions);
        log.info("Session config options updated", { taskRunId });
      }

      // Handle context usage updates
      if (params?.update?.sessionUpdate === "usage_update") {
        const update = params.update as {
          used?: number;
          size?: number;
        };
        if (
          typeof update.used === "number" &&
          typeof update.size === "number"
        ) {
          sessionStoreSetters.updateSession(taskRunId, {
            contextUsed: update.used,
            contextSize: update.size,
          });
        }
      }
    }

    // Handle SDK_SESSION notifications for adapter info
    if (
      "method" in msg &&
      isNotification(msg.method, POSTHOG_NOTIFICATIONS.SDK_SESSION) &&
      "params" in msg
    ) {
      const params = msg.params as {
        adapter?: Adapter;
      };
      if (params?.adapter) {
        sessionStoreSetters.updateSession(taskRunId, {
          adapter: params.adapter,
        });
        useSessionAdapterStore.getState().setAdapter(taskRunId, params.adapter);
        log.info("Session adapter updated", {
          taskRunId,
          adapter: params.adapter,
        });
      }
    }

    if (
      "method" in msg &&
      "params" in msg &&
      isNotification(msg.method, POSTHOG_NOTIFICATIONS.STATUS)
    ) {
      const params = msg.params as { status?: string; isComplete?: boolean };
      if (params?.status === "compacting") {
        sessionStoreSetters.updateSession(taskRunId, {
          isCompacting: !params.isComplete,
        });
      }
    }

    if (
      "method" in msg &&
      isNotification(msg.method, POSTHOG_NOTIFICATIONS.COMPACT_BOUNDARY)
    ) {
      sessionStoreSetters.updateSession(taskRunId, {
        isCompacting: false,
      });

      this.drainQueuedMessages(taskRunId, session);
    }
  }

  private drainQueuedMessages(
    taskRunId: string,
    session: AgentSession,
  ): boolean {
    const freshSession = sessionStoreSetters.getSessions()[taskRunId];
    const hasQueuedMessages =
      freshSession &&
      freshSession.messageQueue.length > 0 &&
      freshSession.status === "connected";

    if (hasQueuedMessages) {
      setTimeout(() => {
        this.sendQueuedMessages(session.taskId).catch((err) => {
          log.error("Failed to send queued messages", {
            taskId: session.taskId,
            error: err,
          });
        });
      }, 0);
    }

    return hasQueuedMessages;
  }

  private handlePermissionRequest(
    taskRunId: string,
    payload: Omit<RequestPermissionRequest, "sessionId"> & {
      taskRunId: string;
    },
  ): void {
    log.info("Permission request received in renderer", {
      taskRunId,
      toolCallId: payload.toolCall.toolCallId,
      title: payload.toolCall.title,
    });

    // Get fresh session state
    const session = sessionStoreSetters.getSessions()[taskRunId];
    if (!session) {
      log.warn("Session not found for permission request", {
        taskRunId,
      });
      return;
    }

    const newPermissions = new Map(session.pendingPermissions);
    // Add receivedAt to create PermissionRequest
    newPermissions.set(payload.toolCall.toolCallId, {
      ...payload,
      receivedAt: Date.now(),
    });

    sessionStoreSetters.setPendingPermissions(taskRunId, newPermissions);
    taskViewedApi.markActivity(session.taskId);
    notifyPermissionRequest(session.taskTitle, session.taskId);
  }

  // --- Prompt Handling ---

  /**
   * Send a prompt to the agent.
   * Queues if a prompt is already pending.
   */
  async sendPrompt(
    taskId: string,
    prompt: string | ContentBlock[],
  ): Promise<{ stopReason: string }> {
    if (!getIsOnline()) {
      throw new Error(
        "No internet connection. Please check your connection and try again.",
      );
    }

    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) throw new Error("No active session for task");

    if (session.isCloud) {
      return this.sendCloudPrompt(session, prompt);
    }

    if (session.status !== "connected") {
      if (session.status === "error") {
        throw new Error(
          session.errorMessage ||
            "Session is in error state. Please retry or start a new session.",
        );
      }
      if (session.status === "connecting") {
        throw new Error(
          "Session is still connecting. Please wait and try again.",
        );
      }
      throw new Error(`Session is not ready (status: ${session.status})`);
    }

    if (session.isPromptPending || session.isCompacting) {
      const promptText = extractPromptText(prompt);
      sessionStoreSetters.enqueueMessage(taskId, promptText);
      log.info("Message queued", {
        taskId,
        queueLength: session.messageQueue.length + 1,
        reason: session.isCompacting ? "compacting" : "prompt_pending",
      });
      return { stopReason: "queued" };
    }

    let blocks = normalizePromptToBlocks(prompt);

    const shellExecutes = getUserShellExecutesSinceLastPrompt(session.events);
    if (shellExecutes.length > 0) {
      const contextBlocks = shellExecutesToContextBlocks(shellExecutes);
      blocks = [...contextBlocks, ...blocks];
    }

    const promptText = extractPromptText(prompt);
    track(ANALYTICS_EVENTS.PROMPT_SENT, {
      task_id: taskId,
      is_initial: session.events.length === 0,
      execution_type: "local",
      prompt_length_chars: promptText.length,
    });

    return this.sendLocalPrompt(session, blocks, promptText);
  }

  /**
   * Send all queued messages as a single prompt.
   * Called internally when a turn completes and there are queued messages.
   * Queue is cleared atomically before sending - if sending fails, messages are lost
   * (this is acceptable since the user can re-type; avoiding complex retry logic).
   */
  private async sendQueuedMessages(
    taskId: string,
  ): Promise<{ stopReason: string }> {
    const combinedText = sessionStoreSetters.dequeueMessagesAsText(taskId);
    if (!combinedText) {
      return { stopReason: "skipped" };
    }

    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.warn("No session found for queued messages, messages lost", {
        taskId,
        lostMessageLength: combinedText.length,
      });
      return { stopReason: "no_session" };
    }

    log.info("Sending queued messages as single prompt", {
      taskId,
      promptLength: combinedText.length,
    });

    let blocks = normalizePromptToBlocks(combinedText);

    const shellExecutes = getUserShellExecutesSinceLastPrompt(session.events);
    if (shellExecutes.length > 0) {
      const contextBlocks = shellExecutesToContextBlocks(shellExecutes);
      blocks = [...contextBlocks, ...blocks];
    }

    track(ANALYTICS_EVENTS.PROMPT_SENT, {
      task_id: taskId,
      is_initial: false,
      execution_type: "local",
      prompt_length_chars: combinedText.length,
    });

    try {
      return await this.sendLocalPrompt(session, blocks, combinedText);
    } catch (error) {
      // Log that queued messages were lost due to send failure
      log.error("Failed to send queued messages, messages lost", {
        taskId,
        lostMessageLength: combinedText.length,
        error,
      });
      throw error;
    }
  }

  private async sendLocalPrompt(
    session: AgentSession,
    blocks: ContentBlock[],
    promptText: string,
  ): Promise<{ stopReason: string }> {
    sessionStoreSetters.updateSession(session.taskRunId, {
      isPromptPending: true,
      promptStartedAt: Date.now(),
      pausedDurationMs: 0,
    });

    sessionStoreSetters.appendOptimisticItem(session.taskRunId, {
      type: "user_message",
      content: promptText,
      timestamp: Date.now(),
    });

    try {
      const result = await trpcClient.agent.prompt.mutate({
        sessionId: session.taskRunId,
        prompt: blocks,
      });
      sessionStoreSetters.updateSession(session.taskRunId, {
        isPromptPending: false,
        promptStartedAt: null,
      });
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorDetails = (error as { data?: { details?: string } }).data
        ?.details;

      sessionStoreSetters.clearOptimisticItems(session.taskRunId);

      if (isFatalSessionError(errorMessage, errorDetails)) {
        log.error("Fatal prompt error, setting session to error state", {
          taskRunId: session.taskRunId,
          errorMessage,
          errorDetails,
        });
        sessionStoreSetters.updateSession(session.taskRunId, {
          status: "error",
          errorMessage:
            errorDetails ||
            "Session connection lost. Please retry or start a new session.",
          isPromptPending: false,
          isCompacting: false,
          promptStartedAt: null,
        });
      } else {
        sessionStoreSetters.updateSession(session.taskRunId, {
          isPromptPending: false,
          isCompacting: false,
          promptStartedAt: null,
        });
      }

      throw error;
    }
  }

  /**
   * Cancel the current prompt.
   */
  async cancelPrompt(taskId: string): Promise<boolean> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return false;

    sessionStoreSetters.updateSession(session.taskRunId, {
      isPromptPending: false,
      promptStartedAt: null,
    });

    if (session.isCloud) {
      return this.cancelCloudPrompt(session);
    }

    try {
      const result = await trpcClient.agent.cancelPrompt.mutate({
        sessionId: session.taskRunId,
      });

      const durationSeconds = Math.round(
        (Date.now() - session.startedAt) / 1000,
      );
      const promptCount = session.events.filter(
        (e) => "method" in e.message && e.message.method === "session/prompt",
      ).length;
      track(ANALYTICS_EVENTS.TASK_RUN_CANCELLED, {
        task_id: taskId,
        execution_type: "local",
        duration_seconds: durationSeconds,
        prompts_sent: promptCount,
      });

      return result;
    } catch (error) {
      log.error("Failed to cancel prompt", error);
      return false;
    }
  }

  // --- Cloud Commands ---

  private async prepareCloudPrompt(
    prompt: string | ContentBlock[],
  ): Promise<{ blocks: ContentBlock[]; promptText: string }> {
    const blocks =
      typeof prompt === "string"
        ? await buildCloudPromptBlocks(prompt)
        : prompt;

    if (blocks.length === 0) {
      throw new Error("Cloud prompt cannot be empty");
    }

    const promptText =
      extractPromptText(blocks).trim() ||
      (typeof prompt === "string" ? buildCloudTaskDescription(prompt) : "");

    return { blocks, promptText };
  }

  private async sendCloudPrompt(
    session: AgentSession,
    prompt: string | ContentBlock[],
    options?: { skipQueueGuard?: boolean },
  ): Promise<{ stopReason: string }> {
    const rawPromptText = extractPromptText(prompt);
    if (!rawPromptText.trim()) {
      return { stopReason: "empty" };
    }

    if (isTerminalStatus(session.cloudStatus)) {
      return this.resumeCloudRun(session, rawPromptText);
    }

    if (!options?.skipQueueGuard && session.isPromptPending) {
      sessionStoreSetters.enqueueMessage(session.taskId, rawPromptText);
      log.info("Cloud message queued", {
        taskId: session.taskId,
        queueLength: session.messageQueue.length + 1,
      });
      return { stopReason: "queued" };
    }

    const auth = await this.getCloudCommandAuth();
    if (!auth) {
      throw new Error("Authentication required for cloud commands");
    }

    const { blocks, promptText } = await this.prepareCloudPrompt(prompt);

    sessionStoreSetters.updateSession(session.taskRunId, {
      isPromptPending: true,
    });

    track(ANALYTICS_EVENTS.PROMPT_SENT, {
      task_id: session.taskId,
      is_initial: session.events.length === 0,
      execution_type: "cloud",
      prompt_length_chars: promptText.length,
    });

    try {
      const result = await trpcClient.cloudTask.sendCommand.mutate({
        taskId: session.taskId,
        runId: session.taskRunId,
        apiHost: auth.apiHost,
        teamId: auth.teamId,
        method: "user_message",
        params: {
          // The live /command API still validates user_message content as a
          // string, so structured prompts must go through the serialized form.
          content: serializeCloudPrompt(blocks),
        },
      });

      sessionStoreSetters.updateSession(session.taskRunId, {
        isPromptPending: false,
      });

      if (!result.success) {
        throw new Error(result.error ?? "Failed to send cloud command");
      }

      const stopReason =
        (result.result as { stopReason?: string })?.stopReason ?? "end_turn";

      const freshSession = sessionStoreSetters.getSessionByTaskId(
        session.taskId,
      );
      if (freshSession && freshSession.messageQueue.length > 0) {
        setTimeout(() => {
          this.sendQueuedCloudMessages(session.taskId).catch((err) => {
            log.error("Failed to send queued cloud messages", {
              taskId: session.taskId,
              error: err,
            });
          });
        }, 0);
      }

      return { stopReason };
    } catch (error) {
      sessionStoreSetters.updateSession(session.taskRunId, {
        isPromptPending: false,
      });
      throw error;
    }
  }

  private async sendQueuedCloudMessages(
    taskId: string,
    attempt = 0,
    pendingText?: string,
  ): Promise<{ stopReason: string }> {
    // First attempt: atomically dequeue. Retries reuse the already-dequeued text.
    const combinedText =
      pendingText ?? sessionStoreSetters.dequeueMessagesAsText(taskId);
    if (!combinedText) return { stopReason: "skipped" };

    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.warn("No session found for queued cloud messages, message lost", {
        taskId,
      });
      return { stopReason: "no_session" };
    }

    log.info("Sending queued cloud messages", {
      taskId,
      promptLength: combinedText.length,
      attempt,
    });

    try {
      return await this.sendCloudPrompt(session, combinedText, {
        skipQueueGuard: true,
      });
    } catch (error) {
      const maxRetries = 5;
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * 2 ** attempt, 10_000);
        log.warn("Cloud message send failed, scheduling retry", {
          taskId,
          attempt,
          delayMs,
          error: String(error),
        });
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              this.sendQueuedCloudMessages(
                taskId,
                attempt + 1,
                combinedText,
              ).catch((err) => {
                log.error("Queued cloud message retry failed", {
                  taskId,
                  attempt: attempt + 1,
                  error: err,
                });
                return { stopReason: "error" };
              }),
            );
          }, delayMs);
        });
      }

      log.error("Queued cloud message send failed after max retries", {
        taskId,
        attempts: attempt + 1,
      });
      toast.error("Failed to send follow-up message. Please try again.");
      return { stopReason: "error" };
    }
  }

  private async resumeCloudRun(
    session: AgentSession,
    prompt: string | ContentBlock[],
  ): Promise<{ stopReason: string }> {
    const client = await getAuthenticatedClient();
    if (!client) {
      throw new Error("Authentication required for cloud commands");
    }
    const auth = await this.getCloudCommandAuth();
    if (!auth) {
      throw new Error("Authentication required for cloud commands");
    }

    const { blocks, promptText } = await this.prepareCloudPrompt(prompt);

    const [previousRun, task] = await Promise.all([
      client.getTaskRun(session.taskId, session.taskRunId),
      client.getTask(session.taskId),
    ]);
    const hasGitHubRepo = !!task.repository && !!task.github_integration;
    const previousState = previousRun.state as Record<string, unknown>;
    const previousOutput = (previousRun.output ?? {}) as Record<
      string,
      unknown
    >;
    // Prefer the actual working branch the agent last pushed to (synced by
    // agent-server after each turn), then the run-level branch field, then
    // the original base branch from state. This preserves unmerged work when
    // the snapshot has expired and the sandbox is rebuilt from scratch.
    const previousBaseBranch =
      (typeof previousOutput.head_branch === "string"
        ? previousOutput.head_branch
        : null) ??
      previousRun.branch ??
      (typeof previousState.pr_base_branch === "string"
        ? previousState.pr_base_branch
        : null) ??
      session.cloudBranch;
    const prAuthorshipMode = this.getCloudPrAuthorshipMode(previousState);
    const githubUserToken =
      prAuthorshipMode === "user" && hasGitHubRepo
        ? await getGhUserTokenOrThrow()
        : undefined;

    log.info("Creating resume run for terminal cloud task", {
      taskId: session.taskId,
      previousRunId: session.taskRunId,
      previousStatus: session.cloudStatus,
    });

    // Create a new run WITH resume context — backend validates the previous run,
    // derives snapshot_external_id server-side, and passes everything as extra_state.
    // The agent will load conversation history and restore the sandbox snapshot.
    const updatedTask = await client.runTaskInCloud(
      session.taskId,
      previousBaseBranch,
      {
        resumeFromRunId: session.taskRunId,
        pendingUserMessage: serializeCloudPrompt(blocks),
        prAuthorshipMode,
        runSource: this.getCloudRunSource(previousState),
        signalReportId:
          typeof previousState.signal_report_id === "string"
            ? previousState.signal_report_id
            : undefined,
        githubUserToken,
      },
    );
    const newRun = updatedTask.latest_run;
    if (!newRun?.id) {
      throw new Error("Failed to create resume run");
    }

    // Replace session with one for the new run, preserving conversation history.
    // setSession handles old session cleanup via taskIdIndex.
    const newSession = this.createBaseSession(
      newRun.id,
      session.taskId,
      session.taskTitle,
    );
    newSession.status = "disconnected";
    newSession.isCloud = true;
    // Carry over existing events and add optimistic user bubble for the follow-up.
    // Reset processedLineCount to 0 because the new run's log stream starts fresh.
    newSession.events = [
      ...session.events,
      createUserMessageEvent(promptText, Date.now()),
    ];
    newSession.processedLineCount = 0;
    // Skip the first session/prompt from polled logs — we already have the
    // optimistic user event, so showing the polled one would duplicate it.
    newSession.skipPolledPromptCount = 1;
    sessionStoreSetters.setSession(newSession);

    // No enqueueMessage / isPromptPending needed — the follow-up is passed
    // in run state (pending_user_message), NOT via user_message command.

    // Start the watcher immediately so we don't miss status updates.
    this.watchCloudTask(session.taskId, newRun.id, auth.apiHost, auth.teamId);

    // Invalidate task queries so the UI picks up the new run metadata
    queryClient.invalidateQueries({ queryKey: ["tasks"] });

    track(ANALYTICS_EVENTS.PROMPT_SENT, {
      task_id: session.taskId,
      is_initial: false,
      execution_type: "cloud",
      prompt_length_chars: promptText.length,
    });

    return { stopReason: "queued" };
  }

  private async cancelCloudPrompt(session: AgentSession): Promise<boolean> {
    if (isTerminalStatus(session.cloudStatus)) {
      log.info("Skipping cancel for terminal cloud run", {
        taskId: session.taskId,
        status: session.cloudStatus,
      });
      return false;
    }

    const auth = await this.getCloudCommandAuth();
    if (!auth) {
      log.error("No auth for cloud cancel");
      return false;
    }

    try {
      const result = await trpcClient.cloudTask.sendCommand.mutate({
        taskId: session.taskId,
        runId: session.taskRunId,
        apiHost: auth.apiHost,
        teamId: auth.teamId,
        method: "cancel",
      });

      const durationSeconds = Math.round(
        (Date.now() - session.startedAt) / 1000,
      );
      const promptCount = session.events.filter(
        (e) => "method" in e.message && e.message.method === "session/prompt",
      ).length;
      track(ANALYTICS_EVENTS.TASK_RUN_CANCELLED, {
        task_id: session.taskId,
        execution_type: "cloud",
        duration_seconds: durationSeconds,
        prompts_sent: promptCount,
      });

      if (!result.success) {
        log.warn("Cloud cancel command failed", { error: result.error });
        return false;
      }

      return true;
    } catch (error) {
      log.error("Failed to cancel cloud prompt", error);
      return false;
    }
  }

  private async getCloudCommandAuth(): Promise<{
    apiHost: string;
    teamId: number;
  } | null> {
    const authState = await fetchAuthState();
    if (!authState.cloudRegion || !authState.projectId) return null;
    return {
      apiHost: getCloudUrlFromRegion(authState.cloudRegion),
      teamId: authState.projectId,
    };
  }

  // --- Permissions ---

  private resolvePermission(session: AgentSession, toolCallId: string): void {
    const permission = session.pendingPermissions.get(toolCallId);
    const newPermissions = new Map(session.pendingPermissions);
    newPermissions.delete(toolCallId);
    sessionStoreSetters.setPendingPermissions(
      session.taskRunId,
      newPermissions,
    );

    if (permission?.receivedAt) {
      sessionStoreSetters.updateSession(session.taskRunId, {
        pausedDurationMs:
          (session.pausedDurationMs ?? 0) +
          (Date.now() - permission.receivedAt),
      });
    }
  }

  /**
   * Respond to a permission request.
   */
  async respondToPermission(
    taskId: string,
    toolCallId: string,
    optionId: string,
    customInput?: string,
    answers?: Record<string, string>,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.error("No session found for permission response", { taskId });
      return;
    }

    const permission = session.pendingPermissions.get(toolCallId);
    track(ANALYTICS_EVENTS.PERMISSION_RESPONDED, {
      task_id: taskId,
      ...buildPermissionToolMetadata(permission, optionId, customInput),
    });

    this.resolvePermission(session, toolCallId);

    try {
      await trpcClient.agent.respondToPermission.mutate({
        taskRunId: session.taskRunId,
        toolCallId,
        optionId,
        customInput,
        answers,
      });

      log.info("Permission response sent", {
        taskId,
        toolCallId,
        optionId,
        hasCustomInput: !!customInput,
      });
    } catch (error) {
      log.error("Failed to respond to permission", {
        taskId,
        toolCallId,
        optionId,
        error,
      });
    }
  }

  /**
   * Cancel a permission request.
   */
  async cancelPermission(taskId: string, toolCallId: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) {
      log.error("No session found for permission cancellation", { taskId });
      return;
    }

    const permission = session.pendingPermissions.get(toolCallId);
    track(ANALYTICS_EVENTS.PERMISSION_CANCELLED, {
      task_id: taskId,
      ...buildPermissionToolMetadata(permission),
    });

    this.resolvePermission(session, toolCallId);

    try {
      await trpcClient.agent.cancelPermission.mutate({
        taskRunId: session.taskRunId,
        toolCallId,
      });

      log.info("Permission cancelled", { taskId, toolCallId });
    } catch (error) {
      log.error("Failed to cancel permission", {
        taskId,
        toolCallId,
        error,
      });
    }
  }

  // --- Config Option Changes (Optimistic Updates) ---

  /**
   * Set a session configuration option with optimistic update and rollback.
   * This is the unified method for model, mode, thought level, etc.
   */
  async setSessionConfigOption(
    taskId: string,
    configId: string,
    value: string,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    // Find the config option and save previous value for rollback
    const configOptions = session.configOptions ?? [];
    const optionIndex = configOptions.findIndex((opt) => opt.id === configId);
    if (optionIndex === -1) {
      log.warn("Config option not found", { taskId, configId });
      return;
    }

    const previousValue = configOptions[optionIndex].currentValue;

    // Skip if value is already set — avoids expensive IPC round-trip (e.g. setModel ~2s)
    if (previousValue === value) {
      return;
    }

    // Optimistic update
    const updatedOptions = configOptions.map((opt) =>
      opt.id === configId
        ? ({ ...opt, currentValue: value } as SessionConfigOption)
        : opt,
    );
    sessionStoreSetters.updateSession(session.taskRunId, {
      configOptions: updatedOptions,
    });
    updatePersistedConfigOptionValue(session.taskRunId, configId, value);

    try {
      await trpcClient.agent.setConfigOption.mutate({
        sessionId: session.taskRunId,
        configId,
        value,
      });
    } catch (error) {
      // Rollback on error
      const rolledBackOptions = configOptions.map((opt) =>
        opt.id === configId
          ? ({ ...opt, currentValue: previousValue } as SessionConfigOption)
          : opt,
      );
      sessionStoreSetters.updateSession(session.taskRunId, {
        configOptions: rolledBackOptions,
      });
      updatePersistedConfigOptionValue(
        session.taskRunId,
        configId,
        String(previousValue),
      );
      log.error("Failed to set session config option", {
        taskId,
        configId,
        value,
        error,
      });
      toast.error("Failed to change setting. Please try again.");
    }
  }

  /**
   * Set a session configuration option by category (e.g., "mode", "model").
   * This is a convenience method that looks up the config ID by category.
   */
  async setSessionConfigOptionByCategory(
    taskId: string,
    category: string,
    value: string,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const configOption = getConfigOptionByCategory(
      session.configOptions,
      category,
    );
    if (!configOption) {
      log.warn("Config option not found for category", { taskId, category });
      return;
    }

    if (configOption.currentValue !== value) {
      track(ANALYTICS_EVENTS.SESSION_CONFIG_CHANGED, {
        task_id: taskId,
        category,
        from_value: String(configOption.currentValue),
        to_value: value,
      });
    }

    await this.setSessionConfigOption(taskId, configOption.id, value);
  }

  /**
   * Start a user shell execute event (shows command as running).
   * Call completeUserShellExecute with the same id when the command finishes.
   */
  async startUserShellExecute(
    taskId: string,
    id: string,
    command: string,
    cwd: string,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const event = createUserShellExecuteEvent(command, cwd, undefined, id);
    sessionStoreSetters.appendEvents(session.taskRunId, [event]);
  }

  /**
   * Complete a user shell execute event with results.
   * Must be called after startUserShellExecute with the same id.
   */
  async completeUserShellExecute(
    taskId: string,
    id: string,
    command: string,
    cwd: string,
    result: { stdout: string; stderr: string; exitCode: number },
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const storedEntry: StoredLogEntry = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        method: "_array/user_shell_execute",
        params: { id, command, cwd, result },
      },
    };

    const event = createUserShellExecuteEvent(command, cwd, result, id);

    await this.appendAndPersist(taskId, session, event, storedEntry);
  }

  /**
   * Append a user shell execute event (synchronous version for backwards compatibility).
   */
  async appendUserShellExecute(
    taskId: string,
    command: string,
    cwd: string,
    result: { stdout: string; stderr: string; exitCode: number },
  ): Promise<void> {
    const id = `user-shell-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 9)}`;
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const storedEntry: StoredLogEntry = {
      type: "notification",
      timestamp: new Date().toISOString(),
      notification: {
        method: "_array/user_shell_execute",
        params: { id, command, cwd, result },
      },
    };

    const event = createUserShellExecuteEvent(command, cwd, result, id);

    await this.appendAndPersist(taskId, session, event, storedEntry);
  }

  /**
   * Retry connecting to the existing session (resume attempt using
   * the sessionId from logs). Does NOT tear down — avoids the connect
   * effect loop.
   *
   * If the session failed before any conversation started (has an
   * initialPrompt saved from the original creation attempt), creates
   * a fresh session and re-sends the prompt instead of reconnecting
   * to an empty session.
   */
  async clearSessionError(taskId: string, repoPath: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (session?.initialPrompt?.length) {
      const { taskTitle, initialPrompt } = session;
      await this.teardownSession(session.taskRunId);
      const auth = await this.getAuthCredentials();
      if (!auth) {
        throw new Error(
          "Unable to reach server. Please check your connection.",
        );
      }
      await this.createNewLocalSession(
        taskId,
        taskTitle,
        repoPath,
        auth,
        initialPrompt,
      );
      return;
    }
    await this.reconnectInPlace(taskId, repoPath);
  }

  /**
   * Start a fresh session for a task, abandoning the old conversation.
   * Clears the backend sessionId so the next reconnect creates a new
   * session instead of attempting to resume the stale one.
   */
  async resetSession(taskId: string, repoPath: string): Promise<void> {
    await this.reconnectInPlace(taskId, repoPath, null);
  }

  /**
   * Cancel the current backend agent and reconnect under the same taskRunId.
   * Does NOT remove the session from the store (avoids connect effect loop).
   * Overwrites the store session in place via reconnectToLocalSession.
   *
   * @param overrideSessionId - Controls which sessionId is used for reconnect:
   *   - `undefined` (default): use the sessionId from logs (resume attempt)
   *   - `null`: strip the sessionId so the backend creates a fresh session
   *   - `string`: use that specific sessionId
   */
  private async reconnectInPlace(
    taskId: string,
    repoPath: string,
    overrideSessionId?: string | null,
  ): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    const { taskRunId, taskTitle, logUrl } = session;

    // Cancel lingering backend agent (ignore errors — it may not exist
    // after a failed reconnect)
    try {
      await trpcClient.agent.cancel.mutate({ sessionId: taskRunId });
    } catch {
      // expected when backend has no session
    }
    this.unsubscribeFromChannel(taskRunId);

    const auth = await this.getAuthCredentials();
    if (!auth) {
      throw new Error("Unable to reach server. Please check your connection.");
    }

    const prefetchedLogs = await this.fetchSessionLogs(logUrl, taskRunId);

    // Determine sessionId: undefined = use from logs, null = strip (fresh), string = use as-is
    const sessionId =
      overrideSessionId === null
        ? undefined
        : (overrideSessionId ?? prefetchedLogs.sessionId);

    await this.reconnectToLocalSession(
      taskId,
      taskRunId,
      taskTitle,
      logUrl,
      repoPath,
      auth,
      { ...prefetchedLogs, sessionId },
    );
  }

  /**
   * Start watching a cloud task via main-process CloudTaskService.
   *
   * The watcher stays alive across navigation. A fresh watcher is created only
   * on first visit or when the runId changes (new run started). Terminal
   * status triggers full teardown from within handleCloudTaskUpdate via
   * stopCloudTaskWatch().
   */
  watchCloudTask(
    taskId: string,
    runId: string,
    apiHost: string,
    teamId: number,
    onStatusChange?: () => void,
  ): () => void {
    const taskRunId = runId;
    const startToken = ++this.nextCloudTaskWatchToken;
    const existingWatcher = this.cloudTaskWatchers.get(taskId);

    // Resuming same run — reuse the existing watcher.
    if (
      existingWatcher &&
      existingWatcher.runId === runId &&
      existingWatcher.apiHost === apiHost &&
      existingWatcher.teamId === teamId
    ) {
      existingWatcher.onStatusChange = onStatusChange;
      return () => {};
    }

    // Different run — full cleanup of old watcher first
    if (existingWatcher) {
      this.stopCloudTaskWatch(taskId);
    }

    // Create session in the store
    const existing = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!existing || existing.taskRunId !== taskRunId) {
      const taskTitle = existing?.taskTitle ?? "Cloud Task";
      const session = this.createBaseSession(taskRunId, taskId, taskTitle);
      session.status = "disconnected";
      session.isCloud = true;
      sessionStoreSetters.setSession(session);
    } else if (!existing.isCloud) {
      sessionStoreSetters.updateSession(existing.taskRunId, {
        isCloud: true,
      });
    }

    // Subscribe before starting the main-process watcher so the first replayed
    // SSE/log burst cannot race ahead of the renderer subscription.
    const subscription = trpcClient.cloudTask.onUpdate.subscribe(
      { taskId, runId },
      {
        onData: (update: CloudTaskUpdatePayload) => {
          this.handleCloudTaskUpdate(taskRunId, update);
          const watcher = this.cloudTaskWatchers.get(taskId);
          if (
            (update.kind === "status" ||
              update.kind === "snapshot" ||
              update.kind === "error") &&
            watcher?.onStatusChange
          ) {
            watcher.onStatusChange();
          }
        },
        onError: (err: unknown) =>
          log.error("Cloud task subscription error", { taskId, err }),
      },
    );

    this.cloudTaskWatchers.set(taskId, {
      runId,
      apiHost,
      teamId,
      startToken,
      subscription,
      onStatusChange,
    });

    // Start main-process watcher after the subscription is attached.
    void (async () => {
      try {
        if (!this.isCurrentCloudTaskWatcher(taskId, runId, startToken)) {
          return;
        }

        await trpcClient.cloudTask.watch.mutate({
          taskId,
          runId,
          apiHost,
          teamId,
        });

        // If the local watcher was torn down while the watch request was in
        // flight, send a compensating unwatch after the start request lands.
        if (!this.isCurrentCloudTaskWatcher(taskId, runId, startToken)) {
          await trpcClient.cloudTask.unwatch.mutate({ taskId, runId });
        }
      } catch (err: unknown) {
        if (!this.isCurrentCloudTaskWatcher(taskId, runId, startToken)) {
          return;
        }
        log.warn("Failed to start cloud task watcher", { taskId, err });
      }
    })();

    return () => {};
  }

  private isCurrentCloudTaskWatcher(
    taskId: string,
    runId: string,
    startToken: number,
  ): boolean {
    const watcher = this.cloudTaskWatchers.get(taskId);
    return watcher?.runId === runId && watcher.startToken === startToken;
  }

  /**
   * Fully stop a cloud task watcher — unsubscribe, unwatch, remove from map.
   * Called on terminal status or when a new run replaces the old one.
   */
  stopCloudTaskWatch(taskId: string): void {
    const watcher = this.cloudTaskWatchers.get(taskId);
    if (!watcher) return;

    watcher.subscription.unsubscribe();
    this.cloudTaskWatchers.delete(taskId);
    trpcClient.cloudTask.unwatch
      .mutate({ taskId, runId: watcher.runId })
      .catch((err: unknown) =>
        log.warn("Failed to unwatch cloud task", { taskId, err }),
      );
  }

  async retryCloudTaskWatch(taskId: string): Promise<void> {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session?.isCloud) {
      throw new Error("No active cloud session for task");
    }

    const previousErrorTitle = session.errorTitle;
    const previousErrorMessage = session.errorMessage;

    sessionStoreSetters.updateSession(session.taskRunId, {
      status: "disconnected",
      errorTitle: undefined,
      errorMessage: undefined,
      isPromptPending: false,
    });

    try {
      await trpcClient.cloudTask.retry.mutate({
        taskId,
        runId: session.taskRunId,
      });
    } catch (error) {
      sessionStoreSetters.updateSession(session.taskRunId, {
        status: "error",
        errorTitle: previousErrorTitle,
        errorMessage: previousErrorMessage,
      });
      throw error;
    }
  }

  public updateSessionTaskTitle(taskId: string, taskTitle: string): void {
    const session = sessionStoreSetters.getSessionByTaskId(taskId);
    if (!session) return;

    if (session.taskTitle === taskTitle) return;

    sessionStoreSetters.updateSession(session.taskRunId, { taskTitle });
  }

  private handleCloudTaskUpdate(
    taskRunId: string,
    update: CloudTaskUpdatePayload,
  ): void {
    if (update.kind === "error") {
      sessionStoreSetters.updateSession(taskRunId, {
        status: "error",
        errorTitle: update.errorTitle,
        errorMessage:
          update.errorMessage ??
          "Lost connection to the cloud run. Retry to reconnect.",
        isPromptPending: false,
      });
      return;
    }

    // Append new log entries with dedup guard
    if (
      (update.kind === "logs" || update.kind === "snapshot") &&
      update.newEntries.length > 0
    ) {
      const session = sessionStoreSetters.getSessions()[taskRunId];
      const currentCount = session?.processedLineCount ?? 0;
      const expectedCount = update.totalEntryCount;
      const delta = expectedCount - currentCount;

      if (delta <= 0) {
        // Already caught up — skip duplicate entries
      } else if (delta <= update.newEntries.length) {
        // Normal case: append only the tail (last `delta` entries)
        const entriesToAppend = update.newEntries.slice(-delta);
        let newEvents = convertStoredEntriesToEvents(entriesToAppend);
        newEvents = this.filterSkippedPromptEvents(
          taskRunId,
          session,
          newEvents,
        );
        sessionStoreSetters.appendEvents(taskRunId, newEvents, expectedCount);
        this.updatePromptStateFromEvents(taskRunId, newEvents);
      } else {
        // Gap in data — append everything we have but don't jump processedLineCount
        log.warn("Cloud task log count inconsistency", {
          taskRunId,
          currentCount,
          expectedCount,
          entriesReceived: update.newEntries.length,
        });
        let newEvents = convertStoredEntriesToEvents(update.newEntries);
        newEvents = this.filterSkippedPromptEvents(
          taskRunId,
          session,
          newEvents,
        );
        sessionStoreSetters.appendEvents(
          taskRunId,
          newEvents,
          currentCount + update.newEntries.length,
        );
        this.updatePromptStateFromEvents(taskRunId, newEvents);
      }
    }

    // Flush queued messages when a cloud turn completes (detected via live log updates)
    const sessionAfterLogs = sessionStoreSetters.getSessions()[taskRunId];
    if (
      sessionAfterLogs &&
      !sessionAfterLogs.isPromptPending &&
      sessionAfterLogs.messageQueue.length > 0
    ) {
      this.sendQueuedCloudMessages(sessionAfterLogs.taskId).catch((err) => {
        log.error("Failed to send queued cloud messages after turn complete", {
          taskId: sessionAfterLogs.taskId,
          error: err,
        });
      });
    }

    // Update cloud status fields if present
    if (update.kind === "status" || update.kind === "snapshot") {
      sessionStoreSetters.updateCloudStatus(taskRunId, {
        status: update.status,
        stage: update.stage,
        output: update.output,
        errorMessage: update.errorMessage,
        branch: update.branch,
      });

      // Auto-send queued messages when a resumed run becomes active
      if (update.status === "in_progress") {
        const session = sessionStoreSetters.getSessions()[taskRunId];
        if (session && session.messageQueue.length > 0) {
          // Clear the pending flag first — resumeCloudRun sets it as a guard
          // while waiting for the run to start. Now that the run is active,
          // sendCloudPrompt needs the flag clear to actually send.
          sessionStoreSetters.updateSession(taskRunId, {
            isPromptPending: false,
          });
          this.sendQueuedCloudMessages(session.taskId).catch(() => {
            // Retries exhausted — message was re-enqueued by
            // sendQueuedCloudMessages, future stream-based completion detection
            // will keep trying
          });
        }
      }

      if (isTerminalStatus(update.status)) {
        // Clean up any pending resume messages that couldn't be sent
        const session = sessionStoreSetters.getSessions()[taskRunId];
        if (
          session &&
          (session.messageQueue.length > 0 || session.isPromptPending)
        ) {
          sessionStoreSetters.clearMessageQueue(session.taskId);
          sessionStoreSetters.updateSession(taskRunId, {
            isPromptPending: false,
          });
        }
        this.stopCloudTaskWatch(update.taskId);
      }
    }
  }

  private getCloudPrAuthorshipMode(
    state: Record<string, unknown>,
  ): PrAuthorshipMode {
    const explicitMode = state.pr_authorship_mode;
    if (explicitMode === "user" || explicitMode === "bot") {
      return explicitMode;
    }
    return state.run_source === "signal_report" ? "bot" : "user";
  }

  private getCloudRunSource(state: Record<string, unknown>): CloudRunSource {
    return state.run_source === "signal_report" ? "signal_report" : "manual";
  }

  /**
   * Filter out session/prompt events that should be skipped during resume.
   * When resuming a cloud run, the initial session/prompt from the new run's
   * logs would duplicate the optimistic user bubble we already added.
   */
  // Note: `session` is a snapshot from the start of handleCloudTaskUpdate.
  // The updateSession call below makes it stale, but this is safe because
  // skipPolledPromptCount is only ever 1, so this method runs at most once.
  private filterSkippedPromptEvents(
    taskRunId: string,
    session: AgentSession | undefined,
    events: AcpMessage[],
  ): AcpMessage[] {
    if (!session?.skipPolledPromptCount || session.skipPolledPromptCount <= 0) {
      return events;
    }

    const promptIdx = events.findIndex(
      (e) =>
        isJsonRpcRequest(e.message) && e.message.method === "session/prompt",
    );
    if (promptIdx !== -1) {
      const filtered = [...events];
      filtered.splice(promptIdx, 1);
      sessionStoreSetters.updateSession(taskRunId, {
        skipPolledPromptCount: (session.skipPolledPromptCount ?? 0) - 1,
      });
      return filtered;
    }

    return events;
  }

  // --- Helper Methods ---

  private async getAuthCredentials(): Promise<AuthCredentials | null> {
    const authState = await fetchAuthState();
    const apiHost = authState.cloudRegion
      ? getCloudUrlFromRegion(authState.cloudRegion)
      : null;
    const projectId = authState.projectId;
    const client = createAuthenticatedClient(authState);

    if (!apiHost || !projectId || !client) return null;
    return { apiHost, projectId, client };
  }

  private parseLogContent(content: string): {
    rawEntries: StoredLogEntry[];
    sessionId?: string;
    adapter?: Adapter;
  } {
    const rawEntries: StoredLogEntry[] = [];
    let sessionId: string | undefined;
    let adapter: Adapter | undefined;

    for (const line of content.trim().split("\n")) {
      try {
        const stored = JSON.parse(line) as StoredLogEntry;
        rawEntries.push(stored);

        if (
          stored.type === "notification" &&
          stored.notification?.method?.endsWith("posthog/sdk_session")
        ) {
          const params = stored.notification.params as {
            sessionId?: string;
            sdkSessionId?: string;
            adapter?: Adapter;
          };
          if (params?.sessionId) sessionId = params.sessionId;
          else if (params?.sdkSessionId) sessionId = params.sdkSessionId;
          if (params?.adapter) adapter = params.adapter;
        }
      } catch {
        log.warn("Failed to parse log entry", { line });
      }
    }

    return { rawEntries, sessionId, adapter };
  }

  private async fetchSessionLogs(
    logUrl: string | undefined,
    taskRunId?: string,
  ): Promise<{
    rawEntries: StoredLogEntry[];
    sessionId?: string;
    adapter?: Adapter;
  }> {
    if (!logUrl && !taskRunId) return { rawEntries: [] };

    if (taskRunId) {
      try {
        const localContent = await trpcClient.logs.readLocalLogs.query({
          taskRunId,
        });
        if (localContent?.trim()) {
          return this.parseLogContent(localContent);
        }
      } catch {
        log.warn("Failed to read local logs, falling back to S3", {
          taskRunId,
        });
      }
    }

    if (!logUrl) return { rawEntries: [] };

    try {
      const content = await trpcClient.logs.fetchS3Logs.query({ logUrl });
      if (!content?.trim()) return { rawEntries: [] };

      const result = this.parseLogContent(content);

      if (taskRunId && result.rawEntries.length > 0) {
        trpcClient.logs.writeLocalLogs
          .mutate({ taskRunId, content })
          .catch((err) => {
            log.warn("Failed to cache S3 logs locally", { taskRunId, err });
          });
      }

      return result;
    } catch {
      return { rawEntries: [] };
    }
  }

  private createBaseSession(
    taskRunId: string,
    taskId: string,
    taskTitle: string,
  ): AgentSession {
    return {
      taskRunId,
      taskId,
      taskTitle,
      channel: `agent-event:${taskRunId}`,
      events: [],
      startedAt: Date.now(),
      status: "connecting",
      isPromptPending: false,
      isCompacting: false,
      promptStartedAt: null,
      pendingPermissions: new Map(),
      pausedDurationMs: 0,
      messageQueue: [],
      optimisticItems: [],
    };
  }

  private async appendAndPersist(
    taskId: string,
    session: AgentSession,
    event: AcpMessage,
    storedEntry: StoredLogEntry,
  ): Promise<void> {
    // Don't update processedLineCount - it tracks S3 log lines, not local events
    sessionStoreSetters.appendEvents(session.taskRunId, [event]);

    const client = await getAuthenticatedClient();
    if (client) {
      try {
        await client.appendTaskRunLog(taskId, session.taskRunId, [storedEntry]);
      } catch (error) {
        log.warn("Failed to persist event to logs", { error });
      }
    }
  }
}
