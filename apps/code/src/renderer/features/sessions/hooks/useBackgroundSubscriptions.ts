import { useAuthState } from "@features/auth/hooks/authQueries";
import { fetchSessionLogs } from "@features/sessions/utils/parseSessionLogs";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspaces } from "@features/workspace/hooks/useWorkspace";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { isTerminalStatus } from "@shared/types";
import { logger } from "@utils/logger";
import { useEffect, useRef } from "react";

const log = logger.scope("background-subscriptions");

/**
 * Ensures the main process has an SSE subscription open for every
 * non-terminal local task run the user has, so mobile-originated commands
 * wake the desktop even when no chat is open and no agent session is
 * active. Reconciles on every task-list refresh — enrolls newcomers,
 * tears down ones that dropped off the list or went terminal.
 */
export function useBackgroundSubscriptions() {
  const { data: tasks } = useTasks();
  const { data: workspaces, isFetched: workspacesFetched } = useWorkspaces();
  const { data: authState } = useAuthState();
  const enrolled = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Wait until we know the user's auth + workspaces. Without repoPath we
    // can't build a valid config and lazy-spawn would fail anyway.
    if (!workspacesFetched) return;
    if (
      authState?.status !== "authenticated" ||
      !authState.cloudRegion ||
      !authState.projectId
    ) {
      return;
    }
    if (!tasks) return;

    const apiHost = getCloudUrlFromRegion(authState.cloudRegion);
    const projectId = authState.projectId;
    const desired = new Map<
      string,
      { taskId: string; taskRunId: string; repoPath: string; logUrl?: string }
    >();

    for (const task of tasks) {
      const run = task.latest_run;
      if (!run) continue;
      if (run.environment !== "local") continue;
      if (isTerminalStatus(run.status)) continue;
      const workspace = workspaces?.[task.id];
      const repoPath = workspace?.folderPath;
      if (!repoPath) continue;
      desired.set(run.id, {
        taskId: task.id,
        taskRunId: run.id,
        repoPath,
        logUrl: run.log_url || undefined,
      });
    }

    for (const [taskRunId, input] of desired) {
      if (enrolled.current.has(taskRunId)) continue;
      enrolled.current.add(taskRunId);

      // Same prep the renderer does when the user opens a task on desktop:
      // fetch the S3 log and extract sessionId/adapter so the main process
      // can resume the Claude session (with history) on lazy-spawn.
      void (async () => {
        try {
          let sessionId: string | undefined;
          let adapter: "claude" | "codex" | undefined;
          if (input.logUrl) {
            const parsed = await fetchSessionLogs(input.logUrl);
            sessionId = parsed.sessionId;
            adapter = parsed.adapter;
          }
          await trpcClient.agent.ensureBackgroundSubscription.mutate({
            taskId: input.taskId,
            taskRunId,
            repoPath: input.repoPath,
            apiHost,
            projectId,
            logUrl: input.logUrl,
            sessionId,
            adapter,
            runMode: "local",
          });
        } catch (err) {
          enrolled.current.delete(taskRunId);
          log.warn("Failed to enroll background subscription", {
            taskRunId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    }

    for (const taskRunId of Array.from(enrolled.current)) {
      if (desired.has(taskRunId)) continue;
      enrolled.current.delete(taskRunId);
      trpcClient.agent.removeBackgroundSubscription
        .mutate({ sessionId: taskRunId })
        .catch((err) => {
          log.warn("Failed to remove background subscription", {
            taskRunId,
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }
  }, [tasks, workspaces, workspacesFetched, authState]);
}
