import { tryExecuteCodeCommand } from "@features/message-editor/commands";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { useTaskViewed } from "@features/sidebar/hooks/useTaskViewed";
import { trpcClient } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { useCallback, useRef } from "react";
import { getSessionService } from "../service/service";
import type { AgentSession } from "../stores/sessionStore";
import { sessionStoreSetters } from "../stores/sessionStore";

const log = logger.scope("session-callbacks");

interface UseSessionCallbacksOptions {
  taskId: string;
  task: Task;
  session: AgentSession | undefined;
  repoPath: string | null;
}

export function useSessionCallbacks({
  taskId,
  task,
  session,
  repoPath,
}: UseSessionCallbacksOptions) {
  const { markActivity, markAsViewed } = useTaskViewed();
  const { requestFocus, setPendingContent } = useDraftStore((s) => s.actions);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const handleSendPrompt = useCallback(
    async (text: string) => {
      const currentSession = sessionRef.current;
      const currentEvents = currentSession?.events ?? [];
      const handled = await tryExecuteCodeCommand(text, {
        taskId,
        repoPath,
        session: currentSession
          ? {
              taskRunId: currentSession.taskRunId,
              logUrl: currentSession.logUrl,
              events: currentEvents,
            }
          : null,
        taskRun: task.latest_run ?? null,
      });
      if (handled) return;

      try {
        markAsViewed(taskId);
        markActivity(taskId);
        const result = await getSessionService().sendPrompt(taskId, text);
        log.info("Prompt completed", { stopReason: result.stopReason });

        const view = useNavigationStore.getState().view;
        const isViewingTask =
          view?.type === "task-detail" && view?.data?.id === taskId;
        if (isViewingTask) {
          markAsViewed(taskId);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send message";
        toast.error(message);
        log.error("Failed to send prompt", error);
      }
    },
    [taskId, repoPath, markActivity, markAsViewed, task.latest_run],
  );

  const handleCancelPrompt = useCallback(async () => {
    const queuedContent = sessionStoreSetters.dequeueMessagesAsText(taskId);
    const result = await getSessionService().cancelPrompt(taskId);
    log.info("Prompt cancelled", { success: result });

    if (queuedContent) {
      setPendingContent(taskId, {
        segments: [{ type: "text", text: queuedContent }],
      });
    }
    requestFocus(taskId);
  }, [taskId, setPendingContent, requestFocus]);

  const handleRetry = useCallback(async () => {
    try {
      if (sessionRef.current?.isCloud) {
        await getSessionService().retryCloudTaskWatch(taskId);
        return;
      }

      if (!repoPath) return;
      await getSessionService().clearSessionError(taskId, repoPath);
    } catch (error) {
      log.error("Failed to clear session error", error);
      toast.error("Failed to retry. Please try again.");
    }
  }, [taskId, repoPath]);

  const handleNewSession = useCallback(async () => {
    if (!repoPath) return;
    try {
      await getSessionService().resetSession(taskId, repoPath);
    } catch (error) {
      log.error("Failed to reset session", error);
      toast.error("Failed to start new session. Please try again.");
    }
  }, [taskId, repoPath]);

  const handleBashCommand = useCallback(
    async (command: string) => {
      if (!repoPath) return;

      const execId = `user-shell-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      await getSessionService().startUserShellExecute(
        taskId,
        execId,
        command,
        repoPath,
      );

      try {
        const result = await trpcClient.shell.execute.mutate({
          cwd: repoPath,
          command,
        });
        await getSessionService().completeUserShellExecute(
          taskId,
          execId,
          command,
          repoPath,
          result,
        );
      } catch (error) {
        log.error("Failed to execute shell command", error);
        await getSessionService().completeUserShellExecute(
          taskId,
          execId,
          command,
          repoPath,
          {
            stdout: "",
            stderr: error instanceof Error ? error.message : "Command failed",
            exitCode: 1,
          },
        );
      }
    },
    [taskId, repoPath],
  );

  return {
    handleSendPrompt,
    handleCancelPrompt,
    handleRetry,
    handleNewSession,
    handleBashCommand,
  };
}
