import { useTaskViewed } from "@features/sidebar/hooks/useTaskViewed";
import { useConnectivity } from "@hooks/useConnectivity";
import { trpcClient } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { useEffect } from "react";
import { getSessionService } from "../service/service";
import type { AgentSession } from "../stores/sessionStore";
import { useChatTitleGenerator } from "./useChatTitleGenerator";

const log = logger.scope("session-connection");

const connectingTasks = new Set<string>();

interface UseSessionConnectionOptions {
  taskId: string;
  task: Task;
  session: AgentSession | undefined;
  repoPath: string | null;
  isCloud: boolean;
}

export function useSessionConnection({
  taskId,
  task,
  session,
  repoPath,
  isCloud,
}: UseSessionConnectionOptions) {
  const queryClient = useQueryClient();
  const { markActivity } = useTaskViewed();
  const { isOnline } = useConnectivity();

  useChatTitleGenerator(taskId);

  useEffect(() => {
    const taskRunId = session?.taskRunId;
    if (!taskRunId) return;
    trpcClient.agent.recordActivity.mutate({ taskRunId }).catch(() => {});
    const heartbeat = setInterval(
      () => {
        trpcClient.agent.recordActivity.mutate({ taskRunId }).catch(() => {});
      },
      5 * 60 * 1000,
    );
    return () => clearInterval(heartbeat);
  }, [session?.taskRunId]);

  useEffect(() => {
    if (!isCloud) return;
    getSessionService().updateSessionTaskTitle(
      task.id,
      task.title || task.description || "Cloud Task",
    );
  }, [isCloud, task.id, task.title, task.description]);

  useEffect(() => {
    if (!isCloud || !task.latest_run?.id) return;
    const runId = task.latest_run.id;
    const cleanup = getSessionService().watchCloudTask(
      task.id,
      runId,
      () => {
        queryClient.invalidateQueries({ queryKey: ["tasks"] });
      },
      true,
    );
    return cleanup;
  }, [isCloud, task.id, task.latest_run?.id, queryClient]);

  useEffect(() => {
    if (!repoPath) return;
    if (connectingTasks.has(taskId)) return;
    if (!isOnline) return;
    if (isCloud) return;

    if (
      session?.status === "connected" ||
      session?.status === "connecting" ||
      session?.status === "error"
    ) {
      return;
    }

    connectingTasks.add(taskId);

    const isNewSession = !task.latest_run?.id;
    const hasInitialPrompt = isNewSession && task.description;

    if (hasInitialPrompt) {
      markActivity(task.id);
    }

    log.info("Connecting to task session", {
      taskId: task.id,
      hasLatestRun: !!task.latest_run,
      sessionStatus: session?.status ?? "none",
    });

    getSessionService()
      .connectToTask({
        task,
        repoPath,
        initialPrompt: hasInitialPrompt
          ? [{ type: "text", text: task.description }]
          : undefined,
      })
      .finally(() => {
        connectingTasks.delete(taskId);
      });

    return () => {
      connectingTasks.delete(taskId);
    };
  }, [task, taskId, repoPath, session, markActivity, isOnline, isCloud]);
}
