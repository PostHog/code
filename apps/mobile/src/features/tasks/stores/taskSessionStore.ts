import { create } from "zustand";
import { logger } from "@/lib/logger";
import {
  CloudCommandError,
  fetchS3Logs,
  getTask,
  getTaskRun,
  runTaskInCloud,
  sendCloudCommand,
} from "../api";
import type { SessionEvent, SessionNotification, Task } from "../types";
import {
  convertRawEntriesToEvents,
  parseSessionLogs,
} from "../utils/parseSessionLogs";

const CLOUD_POLLING_INTERVAL_MS = 500;

export interface TaskSession {
  taskRunId: string;
  taskId: string;
  events: SessionEvent[];
  status: "connecting" | "connected" | "disconnected" | "error";
  isPromptPending: boolean;
  logUrl: string;
  processedLineCount: number;
  processedHashes?: Set<string>;
  // Content of user prompts echoed locally (before the agent writes them to
  // the log). Used by polling to dedup the canonical copy against the echo.
  localUserEchoes?: Set<string>;
  // Terminal backend status for this run, populated by the status-check
  // poller so the UI can surface "Run failed" / "Run completed".
  terminalStatus?: "failed" | "completed";
  lastError?: string | null;
}

interface TaskSessionStore {
  sessions: Record<string, TaskSession>;

  connectToTask: (task: Task) => Promise<void>;
  disconnectFromTask: (taskId: string) => void;
  sendPrompt: (taskId: string, prompt: string) => Promise<void>;
  cancelPrompt: (taskId: string) => Promise<boolean>;
  getSessionForTask: (taskId: string) => TaskSession | undefined;

  _handleEvent: (taskRunId: string, event: SessionEvent) => void;
  _startCloudPolling: (taskRunId: string, logUrl: string) => void;
  _stopCloudPolling: (taskRunId: string) => void;
  _resumeCloudRun: (
    taskId: string,
    previousRunId: string,
    prompt: string,
  ) => Promise<void>;
}

const cloudPollers = new Map<string, ReturnType<typeof setInterval>>();
const connectAttempts = new Set<string>();
// Tick counts per task run used to throttle backend task-run status polling.
const pollTicks = new Map<string, number>();
// How many S3 polling ticks between each backend task-run status check.
const STATUS_CHECK_TICK_INTERVAL = 5;

export const useTaskSessionStore = create<TaskSessionStore>((set, get) => ({
  sessions: {},

  connectToTask: async (task: Task) => {
    const taskId = task.id;
    const latestRunId = task.latest_run?.id;
    const latestRunLogUrl = task.latest_run?.log_url;
    const taskDescription = task.description;

    if (connectAttempts.has(taskId)) {
      logger.debug("Connection already in progress", { taskId });
      return;
    }

    const existing = get().getSessionForTask(taskId);
    if (existing && existing.status === "connected") {
      logger.debug("Already connected to task", { taskId });
      return;
    }

    connectAttempts.add(taskId);

    try {
      if (!latestRunId || !latestRunLogUrl) {
        logger.debug("Task has no run yet, starting cloud run", { taskId });
        const updatedTask = await runTaskInCloud(taskId);
        const newRunId = updatedTask.latest_run?.id;
        const newLogUrl = updatedTask.latest_run?.log_url;

        if (!newRunId || !newLogUrl) {
          logger.error("Failed to start cloud run");
          return;
        }

        set((state) => ({
          sessions: {
            ...state.sessions,
            [newRunId]: {
              taskRunId: newRunId,
              taskId,
              events: taskDescription
                ? [
                    {
                      type: "session_update" as const,
                      ts: Date.now(),
                      notification: {
                        update: {
                          sessionUpdate: "user_message_chunk",
                          content: { type: "text", text: taskDescription },
                        },
                      },
                    },
                  ]
                : [],
              status: "connected",
              isPromptPending: true, // Agent is processing initial task
              logUrl: newLogUrl,
              processedLineCount: 0,
            },
          },
        }));

        get()._startCloudPolling(newRunId, newLogUrl);
        logger.debug("Started new cloud session", {
          taskId,
          taskRunId: newRunId,
        });
        return;
      }

      logger.debug("Fetching cloud session history from S3", {
        taskId,
        latestRunId,
      });
      const content = await fetchS3Logs(latestRunLogUrl);
      const { notifications, rawEntries } = parseSessionLogs(content);
      logger.debug("Loaded cloud historical logs", {
        notifications: notifications.length,
        rawEntries: rawEntries.length,
        backendStatus: task.latest_run?.status,
      });

      const historicalEvents = convertRawEntriesToEvents(
        rawEntries,
        notifications,
        taskDescription,
      );

      // Source of truth for "is the agent still working" is the backend run
      // status, not a heuristic over the log shape. A completed/failed run
      // must NOT show the "Thinking..." indicator even if the last log entry
      // isn't a recognized agent-response type.
      const backendStatus = task.latest_run?.status;
      const isTerminal =
        backendStatus === "completed" || backendStatus === "failed";
      const terminalStatus: "completed" | "failed" | undefined = isTerminal
        ? (backendStatus as "completed" | "failed")
        : undefined;
      const lastError = isTerminal
        ? (task.latest_run?.error_message ?? null)
        : null;

      set((state) => ({
        sessions: {
          ...state.sessions,
          [latestRunId]: {
            taskRunId: latestRunId,
            taskId,
            events: historicalEvents,
            status: "connected",
            isPromptPending: !isTerminal,
            logUrl: latestRunLogUrl,
            processedLineCount: rawEntries.length,
            terminalStatus,
            lastError,
          },
        },
      }));

      get()._startCloudPolling(latestRunId, latestRunLogUrl);
      logger.debug("Connected to cloud session", {
        taskId,
        latestRunId,
        backendStatus,
        isTerminal,
      });
    } catch (error) {
      logger.error("Failed to connect to task", error);
    } finally {
      connectAttempts.delete(taskId);
    }
  },

  disconnectFromTask: (taskId: string) => {
    const session = get().getSessionForTask(taskId);
    if (!session) return;

    get()._stopCloudPolling(session.taskRunId);

    set((state) => {
      const { [session.taskRunId]: _, ...rest } = state.sessions;
      return { sessions: rest };
    });
    logger.debug("Disconnected from task", { taskId });
  },

  sendPrompt: async (taskId: string, prompt: string) => {
    const session = get().getSessionForTask(taskId);
    if (!session) {
      throw new Error("No active session for task");
    }

    // Local echo for immediate UX feedback — polling will re-surface the
    // canonical copy once the agent writes it to the log; any duplicate is
    // removed by content-based dedup in the polling loop below.
    const ts = Date.now();
    const userEvent: SessionEvent = {
      type: "session_update",
      ts,
      notification: {
        update: {
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: prompt },
        },
      },
    };

    set((state) => {
      const current = state.sessions[session.taskRunId];
      const nextLocalEchoes = new Set(current.localUserEchoes ?? []);
      nextLocalEchoes.add(prompt);
      return {
        sessions: {
          ...state.sessions,
          [session.taskRunId]: {
            ...current,
            events: [...current.events, userEvent],
            localUserEchoes: nextLocalEchoes,
            isPromptPending: true,
          },
        },
      };
    });

    try {
      await sendCloudCommand(taskId, session.taskRunId, "user_message", {
        content: prompt,
      });
      logger.debug("Sent cloud command user_message", {
        taskId,
        runId: session.taskRunId,
      });
    } catch (err) {
      // Sandbox for this run has shut down — create a resume run on the
      // backend and swap the local session to the new run id.
      let rollbackError: unknown = err;
      if (err instanceof CloudCommandError && err.isSandboxInactive()) {
        logger.info("Sandbox inactive, creating resume run", {
          taskId,
          previousRunId: session.taskRunId,
        });
        try {
          await get()._resumeCloudRun(taskId, session.taskRunId, prompt);
          return;
        } catch (resumeErr) {
          logger.error("Failed to resume cloud run", resumeErr);
          rollbackError = resumeErr;
        }
      }

      // Roll back the local echo + pending state so the user can retry.
      set((state) => {
        const current = state.sessions[session.taskRunId];
        if (!current) return state;
        const nextLocalEchoes = new Set(current.localUserEchoes ?? []);
        nextLocalEchoes.delete(prompt);
        return {
          sessions: {
            ...state.sessions,
            [session.taskRunId]: {
              ...current,
              events: current.events.filter((e) => e !== userEvent),
              localUserEchoes: nextLocalEchoes,
              isPromptPending: false,
            },
          },
        };
      });
      throw rollbackError;
    }
  },

  cancelPrompt: async (taskId: string) => {
    const session = get().getSessionForTask(taskId);
    if (!session) return false;

    try {
      await sendCloudCommand(taskId, session.taskRunId, "cancel");
      logger.debug("Sent cancel command", {
        taskId,
        runId: session.taskRunId,
      });

      set((state) => ({
        sessions: {
          ...state.sessions,
          [session.taskRunId]: {
            ...state.sessions[session.taskRunId],
            isPromptPending: false,
          },
        },
      }));
      return true;
    } catch (error) {
      logger.error("Failed to send cancel request", error);
      return false;
    }
  },

  getSessionForTask: (taskId: string) => {
    return Object.values(get().sessions).find((s) => s.taskId === taskId);
  },

  _handleEvent: (taskRunId: string, event: SessionEvent) => {
    set((state) => {
      const session = state.sessions[taskRunId];
      if (!session) return state;

      return {
        sessions: {
          ...state.sessions,
          [taskRunId]: {
            ...session,
            events: [...session.events, event],
          },
        },
      };
    });
  },

  _startCloudPolling: (taskRunId: string, logUrl: string) => {
    if (cloudPollers.has(taskRunId)) return;
    logger.debug("Starting cloud S3 polling", { taskRunId });

    const pollS3 = async () => {
      try {
        const session = get().sessions[taskRunId];
        if (!session) {
          get()._stopCloudPolling(taskRunId);
          return;
        }

        // Periodically check the backend task-run status as a safety net
        // for runs that never write anything to the S3 log (e.g. failed
        // pre-agent-start). This prevents "stuck on Thinking..." forever.
        const tick = (pollTicks.get(taskRunId) ?? 0) + 1;
        pollTicks.set(taskRunId, tick);
        if (tick % STATUS_CHECK_TICK_INTERVAL === 0) {
          try {
            const run = await getTaskRun(session.taskId, taskRunId);
            logger.debug("Status check", {
              taskRunId,
              status: run.status,
              error: run.error_message,
            });
            if (run.status === "failed" || run.status === "completed") {
              logger.debug("Backend run reached terminal status", {
                taskRunId,
                status: run.status,
                error: run.error_message,
              });
              set((state) => {
                const current = state.sessions[taskRunId];
                if (!current) return state;
                return {
                  sessions: {
                    ...state.sessions,
                    [taskRunId]: {
                      ...current,
                      isPromptPending: false,
                      terminalStatus: run.status as "failed" | "completed",
                      lastError: run.error_message,
                    },
                  },
                };
              });
            }
          } catch (statusErr) {
            logger.warn("Failed to fetch task run status", {
              error: statusErr,
            });
          }
        }

        const text = await fetchS3Logs(logUrl);
        if (!text) return;

        const lines = text.trim().split("\n").filter(Boolean);
        const processedCount = session.processedLineCount ?? 0;

        if (lines.length > processedCount) {
          const newLines = lines.slice(processedCount);
          logger.debug("Poll picked up new log lines", {
            taskRunId,
            newLineCount: newLines.length,
            totalLines: lines.length,
          });
          const currentHashes = new Set(session.processedHashes ?? []);
          const remainingLocalEchoes = new Set(session.localUserEchoes ?? []);

          let receivedAgentMessage = false;

          for (const line of newLines) {
            try {
              const entry = JSON.parse(line);
              const ts = entry.timestamp
                ? new Date(entry.timestamp).getTime()
                : Date.now();

              const hash = `${entry.timestamp ?? ""}-${entry.notification?.method ?? ""}-${entry.direction ?? ""}`;
              if (currentHashes.has(hash)) {
                continue;
              }
              currentHashes.add(hash);

              const acpEvent: SessionEvent = {
                type: "acp_message",
                direction: entry.direction ?? "agent",
                ts,
                message: entry.notification,
              };
              get()._handleEvent(taskRunId, acpEvent);

              // Terminal notifications from the agent — when the run
              // completes or errors, clear the pending indicator so the
              // UI doesn't stay stuck on "Thinking...".
              if (
                entry.type === "notification" &&
                (entry.notification?.method === "_posthog/task_complete" ||
                  entry.notification?.method === "_posthog/error")
              ) {
                receivedAgentMessage = true;
                logger.debug("Received terminal notification", {
                  taskRunId,
                  method: entry.notification.method,
                });
              }

              if (
                entry.type === "notification" &&
                entry.notification?.method === "session/update" &&
                entry.notification?.params
              ) {
                const params = entry.notification.params as SessionNotification;
                const sessionUpdate = params?.update?.sessionUpdate;

                // If this is a user_message_chunk that matches a locally
                // echoed prompt, consume the echo and skip — prevents the
                // prompt from rendering twice.
                if (sessionUpdate === "user_message_chunk") {
                  const text = params?.update?.content?.text;
                  if (text && remainingLocalEchoes.has(text)) {
                    remainingLocalEchoes.delete(text);
                    continue;
                  }
                }

                const sessionUpdateEvent: SessionEvent = {
                  type: "session_update",
                  ts,
                  notification: params,
                };
                get()._handleEvent(taskRunId, sessionUpdateEvent);

                // Check if this is an agent message - means agent is
                // responding. `agent_message` is the aggregated final
                // message emitted by the server once a response completes
                // (as opposed to streaming `agent_message_chunk` frames).
                if (
                  sessionUpdate === "agent_message_chunk" ||
                  sessionUpdate === "agent_message" ||
                  sessionUpdate === "agent_thought_chunk"
                ) {
                  receivedAgentMessage = true;
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }

          set((state) => ({
            sessions: {
              ...state.sessions,
              [taskRunId]: {
                ...state.sessions[taskRunId],
                processedLineCount: lines.length,
                processedHashes: currentHashes,
                localUserEchoes: remainingLocalEchoes,
                // Clear pending state when we receive agent response
                isPromptPending: receivedAgentMessage
                  ? false
                  : (state.sessions[taskRunId]?.isPromptPending ?? false),
              },
            },
          }));
        }
      } catch (err) {
        logger.warn("Cloud polling error", { error: err });
      }
    };

    pollS3();
    const interval = setInterval(pollS3, CLOUD_POLLING_INTERVAL_MS);
    cloudPollers.set(taskRunId, interval);
  },

  _stopCloudPolling: (taskRunId: string) => {
    const interval = cloudPollers.get(taskRunId);
    if (interval) {
      clearInterval(interval);
      cloudPollers.delete(taskRunId);
      pollTicks.delete(taskRunId);
      logger.debug("Stopped cloud S3 polling", { taskRunId });
    }
  },

  _resumeCloudRun: async (
    taskId: string,
    previousRunId: string,
    prompt: string,
  ) => {
    // Fetch the latest task to pick up the branch the previous run was using —
    // otherwise the backend would create a new branch and we'd lose working
    // tree context.
    const freshTask = await getTask(taskId);
    const previousBranch = freshTask.latest_run?.branch ?? null;

    const updatedTask = await runTaskInCloud(taskId, {
      branch: previousBranch,
      resumeFromRunId: previousRunId,
      pendingUserMessage: prompt,
    });

    const newRun = updatedTask.latest_run;
    if (!newRun?.id || !newRun.log_url) {
      throw new Error("Resume run was created but has no id or log_url");
    }

    // Stop polling the dead run and swap the session over to the new run id.
    // Read the CURRENT session state to preserve the local echo that was
    // just added in sendPrompt (the captured `session` variable in the
    // caller is stale).
    get()._stopCloudPolling(previousRunId);

    set((state) => {
      const previousSession = state.sessions[previousRunId];
      if (!previousSession) return state;
      const { [previousRunId]: _old, ...rest } = state.sessions;
      return {
        sessions: {
          ...rest,
          [newRun.id]: {
            ...previousSession,
            taskRunId: newRun.id,
            logUrl: newRun.log_url,
            status: "connected",
            isPromptPending: true,
            processedLineCount: 0,
            processedHashes: new Set<string>(),
          },
        },
      };
    });

    get()._startCloudPolling(newRun.id, newRun.log_url);
    logger.debug("Swapped to resume run", {
      taskId,
      previousRunId,
      newRunId: newRun.id,
    });
  },
}));
