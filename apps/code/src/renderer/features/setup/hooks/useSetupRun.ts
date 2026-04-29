import { getAuthenticatedClient } from "@features/auth/hooks/authClient";
import { fetchAuthState } from "@features/auth/hooks/authQueries";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { DISCOVERY_PROMPT, WIZARD_PROMPT } from "@features/setup/prompts";
import { useSetupStore } from "@features/setup/stores/setupStore";
import type { DiscoveredTask } from "@features/setup/types";
import { TASK_DISCOVERY_JSON_SCHEMA } from "@features/setup/types";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import {
  type TaskCreationInput,
  TaskCreationSaga,
} from "@renderer/sagas/task/task-creation";
import { trpcClient } from "@renderer/trpc/client";
import { isTerminalStatus, type Task } from "@shared/types";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { getCloudUrlFromRegion } from "@shared/utils/urls";
import { captureException, track } from "@utils/analytics";
import { logger } from "@utils/logger";
import { queryClient } from "@utils/queryClient";
import { useCallback, useEffect, useRef, useState } from "react";

const log = logger.scope("setup-run");

interface ActivityEntry {
  id: number;
  toolCallId: string;
  tool: string;
  filePath: string | null;
  title: string;
}

function handleSessionUpdate(
  payload: unknown,
  pushActivity: (entry: ActivityEntry) => void,
) {
  const acpMsg = payload as { message?: Record<string, unknown> };
  const inner = acpMsg.message;
  if (!inner) return;

  if ("method" in inner && inner.method === "session/update") {
    const params = inner.params as Record<string, unknown> | undefined;
    if (!params) return;

    const update = (params.update as Record<string, unknown>) ?? params;

    const entry = extractToolCall(update);
    if (entry) {
      pushActivity(entry);
    }
  }
}

let activityIdCounter = 0;

function extractPathFromRawInput(
  tool: string,
  rawInput: Record<string, unknown> | undefined,
): string | null {
  if (!rawInput) return null;

  switch (tool) {
    case "Read":
    case "Edit":
    case "Write":
      return (rawInput.file_path as string) ?? null;
    case "Grep":
      return (rawInput.pattern as string)
        ? `"${rawInput.pattern}"${rawInput.path ? ` in ${rawInput.path}` : ""}`
        : ((rawInput.path as string) ?? null);
    case "Glob":
      return (rawInput.pattern as string) ?? null;
    case "Bash": {
      const cmd = rawInput.command as string | undefined;
      if (!cmd) return null;
      return cmd.length > 80 ? `${cmd.slice(0, 77)}...` : cmd;
    }
    default: {
      const filePath =
        rawInput.file_path ?? rawInput.path ?? rawInput.notebook_path;
      if (typeof filePath === "string") return filePath;
      const pattern = rawInput.pattern;
      if (typeof pattern === "string") return `"${pattern}"`;
      const command = rawInput.command;
      if (typeof command === "string")
        return command.length > 80 ? `${command.slice(0, 77)}...` : command;
      const url = rawInput.url;
      if (typeof url === "string") return url;
      const query = rawInput.query;
      if (typeof query === "string") return query;
      return null;
    }
  }
}

function extractToolCall(
  update: Record<string, unknown>,
): ActivityEntry | null {
  const sessionUpdate = update.sessionUpdate as string | undefined;
  if (sessionUpdate !== "tool_call" && sessionUpdate !== "tool_call_update")
    return null;

  const meta = update._meta as
    | { claudeCode?: { toolName?: string } }
    | undefined;
  const tool = meta?.claudeCode?.toolName ?? "Working";
  const locations = update.locations as
    | { path?: string; line?: number }[]
    | undefined;
  const rawInput = (update.rawInput ?? update.input) as
    | Record<string, unknown>
    | undefined;
  const filePath =
    locations?.[0]?.path ?? extractPathFromRawInput(tool, rawInput);
  const title = (update.title as string) ?? "";
  const toolCallId = (update.toolCallId as string) ?? "";

  activityIdCounter += 1;
  return { id: activityIdCounter, toolCallId, tool, filePath, title };
}

const POSTHOG_PACKAGES = [
  "posthog-js",
  "posthog-node",
  "posthog-react-native",
  "@posthog/react-native-session-replay",
  "posthog-android",
  "posthog-ios",
  "posthog-flutter",
];

async function isPosthogInstalled(repoPath: string): Promise<boolean> {
  try {
    const content = await trpcClient.fs.readRepoFile.query({
      repoPath,
      filePath: "package.json",
    });
    if (!content) return false;
    const pkg = JSON.parse(content);
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };
    return POSTHOG_PACKAGES.some((name) => name in allDeps);
  } catch {
    return false;
  }
}

async function resolveWizardWorkspaceMode(
  client: PostHogAPIClient,
): Promise<"cloud" | "worktree"> {
  try {
    const integrations = await client.getIntegrations();
    const hasGithub = (integrations as { kind: string }[]).some(
      (i) => i.kind === "github",
    );
    if (hasGithub) return "cloud";
  } catch (err) {
    log.warn("Failed to check GitHub integration, falling back to worktree", {
      error: err,
    });
  }
  return "worktree";
}

export function useSetupRun() {
  const selectedDirectory = useOnboardingStore((s) => s.selectedDirectory);
  const discoveryStatus = useSetupStore((s) => s.discoveryStatus);
  const storedTasks = useSetupStore((s) => s.discoveredTasks);
  const storedWizardTaskId = useSetupStore((s) => s.wizardTaskId);
  const wizardSkipped = useSetupStore((s) => s.wizardSkipped);
  const discoveryFeed = useSetupStore((s) => s.discoveryFeed);
  const wizardFeed = useSetupStore((s) => s.wizardFeed);

  const [isDiscoveryDone, setIsDiscoveryDone] = useState(
    discoveryStatus === "done",
  );
  const [discoveredTasks, setDiscoveredTasks] =
    useState<DiscoveredTask[]>(storedTasks);
  const [isWizardStarted, setIsWizardStarted] = useState(!!storedWizardTaskId);
  const [error, setError] = useState<string | null>(null);

  const startedRef = useRef(false);
  const discoveryStartedAtRef = useRef<number | null>(null);

  const subscribeToWizardEvents = useCallback((taskId: string) => {
    const checkForRun = async () => {
      const client = await getAuthenticatedClient();
      if (!client) return;

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const taskData = (await client.getTask(taskId)) as unknown as Task;
          const runId = taskData.latest_run?.id;
          if (runId) {
            log.debug("Wizard run found, subscribing", { taskId, runId });
            trpcClient.agent.onSessionEvent.subscribe(
              { taskRunId: runId },
              {
                onData: (payload: unknown) => {
                  handleSessionUpdate(payload, (entry) => {
                    useSetupStore.getState().pushWizardActivity(entry);
                  });
                },
                onError: (err) => {
                  log.error("Wizard subscription error", { error: err });
                },
              },
            );
            return;
          }
        } catch {
          // keep polling
        }
      }
    };
    checkForRun().catch((err) =>
      log.error("Wizard event subscribe failed", { error: err }),
    );
  }, []);

  const startWizardTask = useCallback(async () => {
    const existingId = useSetupStore.getState().wizardTaskId;
    if (existingId) {
      log.debug("Wizard task already exists, skipping", {
        wizardTaskId: existingId,
      });
      setIsWizardStarted(true);
      return;
    }

    log.debug("Starting wizard task");
    try {
      const client = await getAuthenticatedClient();
      if (!client) {
        log.error("getAuthenticatedClient returned null for wizard");
        track(ANALYTICS_EVENTS.SETUP_WIZARD_FAILED, {
          reason: "unauthenticated_client",
        });
        return;
      }

      const repoPath = selectedDirectory;
      if (!repoPath) {
        log.warn("No selectedDirectory for wizard task");
        track(ANALYTICS_EVENTS.SETUP_WIZARD_FAILED, {
          reason: "missing_directory",
        });
        return;
      }

      if (await isPosthogInstalled(repoPath)) {
        log.info("PostHog already installed, skipping wizard");
        useSetupStore.getState().skipWizard();
        track(ANALYTICS_EVENTS.SETUP_WIZARD_FAILED, {
          reason: "already_installed",
        });
        return;
      }

      const workspaceMode = await resolveWizardWorkspaceMode(client);
      log.info("Wizard workspace mode resolved", { workspaceMode });

      const sagaInput: TaskCreationInput = {
        taskDescription: WIZARD_PROMPT,
        content: WIZARD_PROMPT,
        repoPath,
        workspaceMode,
        executionMode: "auto",
      };

      const saga = new TaskCreationSaga({
        posthogClient: client,
        onTaskReady: ({ task }) => {
          useSetupStore.getState().setWizardTaskId(task.id);
          setIsWizardStarted(true);
          track(ANALYTICS_EVENTS.SETUP_WIZARD_STARTED, {
            wizard_task_id: task.id,
            workspace_mode: workspaceMode,
          });
          queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });
          subscribeToWizardEvents(task.id);
        },
      });

      const result = await saga.run(sagaInput);

      if (!result.success) {
        throw new Error(
          `Wizard saga failed at step: ${result.failedStep ?? "unknown"}`,
        );
      }

      const task = result.data.task;
      useSetupStore.getState().setWizardTaskId(task.id);
      setIsWizardStarted(true);
      queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });
      subscribeToWizardEvents(task.id);
    } catch (err) {
      log.error("Failed to start wizard task", { error: err });
      const message =
        err instanceof Error ? err.message : "Failed to start wizard task.";
      track(ANALYTICS_EVENTS.SETUP_WIZARD_FAILED, {
        reason: "startup_error",
        error_message: message,
      });
      if (err instanceof Error) {
        captureException(err, { scope: "setup.start_wizard_task" });
      }
    }
  }, [selectedDirectory, subscribeToWizardEvents]);

  const startDiscovery = useCallback(async () => {
    const state = useSetupStore.getState();
    if (
      state.discoveryStatus === "done" ||
      state.discoveryStatus === "running"
    ) {
      return;
    }

    try {
      const authState = await fetchAuthState();
      const apiHost = authState.cloudRegion
        ? getCloudUrlFromRegion(authState.cloudRegion)
        : null;
      const projectId = authState.projectId;

      if (!apiHost || !projectId) {
        log.error("Missing auth for discovery", { apiHost, projectId });
        setError("Authentication required.");
        useSetupStore.getState().failDiscovery();
        track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
          reason: "startup_error",
          error_message: "missing_auth",
        });
        return;
      }

      const client = await getAuthenticatedClient();
      if (!client) {
        setError("Authentication required.");
        useSetupStore.getState().failDiscovery();
        track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
          reason: "startup_error",
          error_message: "unauthenticated_client",
        });
        return;
      }

      const repoPath = selectedDirectory;
      if (!repoPath) {
        setError("No directory selected.");
        useSetupStore.getState().failDiscovery();
        track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
          reason: "startup_error",
          error_message: "missing_directory",
        });
        return;
      }

      const task = (await client.createTask({
        title: "Discover first tasks",
        description: DISCOVERY_PROMPT,
        json_schema: TASK_DISCOVERY_JSON_SCHEMA as Record<string, unknown>,
      })) as unknown as Task;

      const taskRun = await client.createTaskRun(task.id);
      if (!taskRun?.id) {
        throw new Error("Failed to create discovery task run");
      }

      useSetupStore.getState().startDiscovery(task.id, taskRun.id);
      discoveryStartedAtRef.current = Date.now();
      track(ANALYTICS_EVENTS.SETUP_DISCOVERY_STARTED, {
        discovery_task_id: task.id,
        discovery_task_run_id: taskRun.id,
      });

      await trpcClient.agent.start.mutate({
        taskId: task.id,
        taskRunId: taskRun.id,
        repoPath,
        apiHost,
        projectId,
        permissionMode: "bypassPermissions",
        jsonSchema: TASK_DISCOVERY_JSON_SCHEMA as Record<string, unknown>,
      });

      trpcClient.agent.prompt
        .mutate({
          sessionId: taskRun.id,
          prompt: [{ type: "text", text: DISCOVERY_PROMPT }],
        })
        .catch((err) => {
          log.error("Failed to send discovery prompt", { error: err });
        });

      const subscription = trpcClient.agent.onSessionEvent.subscribe(
        { taskRunId: taskRun.id },
        {
          onData: (payload: unknown) => {
            handleSessionUpdate(payload, (entry) => {
              useSetupStore.getState().pushDiscoveryActivity(entry);
            });
          },
          onError: (err) => {
            log.error("Discovery subscription error", { error: err });
          },
        },
      );

      const pollForCompletion = async () => {
        const maxAttempts = 120;
        const intervalMs = 5000;

        for (let i = 0; i < maxAttempts; i++) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));

          try {
            const run = await client.getTaskRun(task.id, taskRun.id);

            if (isTerminalStatus(run.status)) {
              subscription.unsubscribe();

              const startedAt = discoveryStartedAtRef.current;
              const durationSeconds = startedAt
                ? Math.round((Date.now() - startedAt) / 1000)
                : 0;

              if (run.status === "completed" && run.output) {
                const output = run.output as { tasks?: DiscoveredTask[] };
                const tasks = output.tasks ?? [];
                log.info("Discovery completed", { taskCount: tasks.length });
                useSetupStore.getState().completeDiscovery(tasks);
                setDiscoveredTasks(tasks);
                setIsDiscoveryDone(true);
                track(ANALYTICS_EVENTS.SETUP_DISCOVERY_COMPLETED, {
                  discovery_task_id: task.id,
                  discovery_task_run_id: taskRun.id,
                  task_count: tasks.length,
                  duration_seconds: durationSeconds,
                });
              } else if (
                run.status === "failed" ||
                run.status === "cancelled"
              ) {
                log.error("Discovery failed", { status: run.status });
                useSetupStore.getState().failDiscovery();
                setError("Discovery failed. You can skip or retry.");
                track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
                  discovery_task_id: task.id,
                  discovery_task_run_id: taskRun.id,
                  reason: run.status,
                });
              } else {
                useSetupStore.getState().completeDiscovery([]);
                setDiscoveredTasks([]);
                setIsDiscoveryDone(true);
                track(ANALYTICS_EVENTS.SETUP_DISCOVERY_COMPLETED, {
                  discovery_task_id: task.id,
                  discovery_task_run_id: taskRun.id,
                  task_count: 0,
                  duration_seconds: durationSeconds,
                });
              }
              return;
            }
          } catch (err) {
            log.warn("Failed to poll discovery", {
              attempt: i + 1,
              error: err,
            });
          }
        }

        subscription.unsubscribe();
        useSetupStore.getState().failDiscovery();
        setError("Discovery timed out. You can skip or retry.");
        track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
          discovery_task_id: task.id,
          discovery_task_run_id: taskRun.id,
          reason: "timeout",
        });
      };

      pollForCompletion().catch((err) => {
        log.error("Discovery poll failed", { error: err });
        useSetupStore.getState().failDiscovery();
        setError("Discovery failed unexpectedly.");
        track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
          discovery_task_id: task.id,
          discovery_task_run_id: taskRun.id,
          reason: "failed",
          error_message:
            err instanceof Error ? err.message : "discovery_poll_error",
        });
        if (err instanceof Error) {
          captureException(err, { scope: "setup.discovery_poll" });
        }
      });
    } catch (err) {
      log.error("Failed to start discovery", { error: err });
      useSetupStore.getState().failDiscovery();
      const message =
        err instanceof Error ? err.message : "Failed to start discovery.";
      setError(message);
      track(ANALYTICS_EVENTS.SETUP_DISCOVERY_FAILED, {
        reason: "startup_error",
        error_message: message,
      });
      if (err instanceof Error) {
        captureException(err, { scope: "setup.start_discovery" });
      }
    }
  }, [selectedDirectory]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    if (discoveryStatus === "done") {
      setDiscoveredTasks(storedTasks);
      setIsDiscoveryDone(true);
      return;
    }

    startWizardTask().catch((err) => {
      log.error("Wizard task startup failed", { error: err });
    });

    startDiscovery().catch((err) => {
      log.error("Discovery startup failed", { error: err });
    });
  }, [discoveryStatus, storedTasks, startWizardTask, startDiscovery]);

  return {
    discoveryFeed,
    wizardFeed,
    isDiscoveryDone,
    isWizardStarted,
    wizardSkipped,
    discoveredTasks,
    wizardTaskId: storedWizardTaskId,
    error,
  };
}
