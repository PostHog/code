import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { useFolders } from "@features/folders/hooks/useFolders";
import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import { tryExecuteTwigCommand } from "@features/message-editor/commands";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { SessionView } from "@features/sessions/components/SessionView";
import { useChatTitleGenerator } from "@features/sessions/hooks/useChatTitleGenerator";
import { getSessionService } from "@features/sessions/service/service";
import {
  sessionStoreSetters,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskViewed } from "@features/sidebar/hooks/useTaskViewed";
import { WorkspaceSetupPrompt } from "@features/task-detail/components/WorkspaceSetupPrompt";
import {
  useCreateWorkspace,
  useWorkspace,
  useWorkspaceLoaded,
} from "@features/workspace/hooks/useWorkspace";
import { useConnectivity } from "@hooks/useConnectivity";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { getTaskRepository } from "@utils/repository";
import { toast } from "@utils/toast";
import { useCallback, useEffect, useMemo, useRef } from "react";

const log = logger.scope("task-logs-panel");

interface TaskLogsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskLogsPanel({ taskId, task }: TaskLogsPanelProps) {
  const repoPath = useCwd(taskId);
  const workspace = useWorkspace(taskId);
  const queryClient = useQueryClient();
  const isWorkspaceLoaded = useWorkspaceLoaded();
  const { isPending: isCreatingWorkspace } = useCreateWorkspace();
  const repoKey = getTaskRepository(task);
  const { folders } = useFolders();
  const hasDirectoryMapping = repoKey
    ? folders.some((f) => f.remoteUrl === repoKey)
    : false;

  const session = useSessionForTask(taskId);
  const { markActivity, markAsViewed } = useTaskViewed();
  const { requestFocus, setPendingContent } = useDraftStore((s) => s.actions);
  const { isOnline } = useConnectivity();

  useChatTitleGenerator(taskId);

  // Workspace store is only populated once a task is opened in Twig.
  // For Slack-created tasks that haven't been opened yet, fall back to the API run environment.
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";

  const cloudStatus = session?.cloudStatus ?? null;
  const cloudStage = session?.cloudStage ?? null;
  const cloudOutput = session?.cloudOutput ?? null;
  const cloudErrorMessage = session?.cloudErrorMessage ?? null;
  const isCloudRunNotTerminal =
    isCloud &&
    (!cloudStatus ||
      cloudStatus === "started" ||
      cloudStatus === "in_progress");
  const isCloudRunTerminal = isCloud && !isCloudRunNotTerminal;
  const prUrl =
    isCloud && cloudOutput?.pr_url ? (cloudOutput.pr_url as string) : null;
  const slackThreadUrl =
    typeof task.latest_run?.state?.slack_thread_url === "string"
      ? task.latest_run.state.slack_thread_url
      : undefined;

  // Cloud diff stats — reuses React Query cache from ChangesPanel
  const cloudBranch = isCloud
    ? (workspace?.baseBranch ?? task.latest_run?.branch ?? null)
    : null;
  const cloudRepo = isCloud ? (task.repository ?? null) : null;
  const { data: prFiles } = useCloudPrChangedFiles(prUrl);
  const { data: branchFiles } = useCloudBranchChangedFiles(
    !prUrl ? cloudRepo : null,
    !prUrl ? cloudBranch : null,
  );
  const cloudDiffStats = useMemo(() => {
    if (!isCloud) return null;
    const files = prUrl ? prFiles : branchFiles;
    if (!files || files.length === 0) return null;
    return {
      filesChanged: files.length,
      linesAdded: files.reduce((sum, f) => sum + (f.linesAdded ?? 0), 0),
      linesRemoved: files.reduce((sum, f) => sum + (f.linesRemoved ?? 0), 0),
    };
  }, [isCloud, prUrl, prFiles, branchFiles]);

  const isRunning = isCloud
    ? isCloudRunNotTerminal
    : session?.status === "connected";
  const hasError = isCloud ? false : session?.status === "error";
  const errorTitle = isCloud ? undefined : session?.errorTitle;
  const errorMessage = isCloud ? undefined : session?.errorMessage;

  const events = session?.events ?? [];
  const isPromptPending = session?.isPromptPending ?? false;
  const promptStartedAt = session?.promptStartedAt;

  const isNewSessionWithInitialPrompt =
    !task.latest_run?.id && !!task.description;
  const isResumingExistingSession = !!task.latest_run?.id;
  const isInitializing = isCloud
    ? !session || (events.length === 0 && isCloudRunNotTerminal)
    : !session ||
      (session.status === "connecting" && events.length === 0) ||
      (session.status === "connected" &&
        events.length === 0 &&
        (isPromptPending ||
          isNewSessionWithInitialPrompt ||
          isResumingExistingSession));

  const isConnecting = useRef(false);

  useEffect(() => {
    requestFocus(taskId);
  }, [taskId, requestFocus]);

  // Keep cloud session title aligned with latest task metadata.
  useEffect(() => {
    if (!isCloud) return;
    getSessionService().updateCloudTaskTitle(
      task.id,
      task.title || task.description || "Cloud Task",
    );
  }, [isCloud, task.id, task.title, task.description]);

  // Cloud task watching — logs + status via main-process CloudTaskService subscription
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

  // Local session connection
  useEffect(() => {
    if (!repoPath) return;
    if (isConnecting.current) return;
    if (!isOnline) return;

    // Cloud tasks use the cloud watcher effect above
    if (isCloud) return;

    if (
      session?.status === "connected" ||
      session?.status === "connecting" ||
      session?.status === "error"
    ) {
      return;
    }

    isConnecting.current = true;

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
        isConnecting.current = false;
      });
  }, [task, repoPath, session, markActivity, isOnline, isCloud]);

  const handleSendPrompt = useCallback(
    async (text: string) => {
      const handled = await tryExecuteTwigCommand(text, {
        taskId,
        repoPath,
        session: session
          ? {
              taskRunId: session.taskRunId,
              logUrl: session.logUrl,
              events,
            }
          : null,
        taskRun: task.latest_run ?? null,
      });
      if (handled) return;

      try {
        markAsViewed(taskId);

        const result = await getSessionService().sendPrompt(taskId, text);
        log.info("Prompt completed", { stopReason: result.stopReason });

        markActivity(taskId);

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
    [
      taskId,
      repoPath,
      markActivity,
      markAsViewed,
      events,
      session,
      task.latest_run,
    ],
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
    if (!repoPath) return;
    try {
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

      const execId = `user-shell-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 9)}`;
      await getSessionService().startUserShellExecute(
        taskId,
        execId,
        command,
        repoPath,
      );

      try {
        const result = await trpcVanilla.shell.execute.mutate({
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

  if (
    !repoPath &&
    !isCloud &&
    isWorkspaceLoaded &&
    !hasDirectoryMapping &&
    !isCreatingWorkspace
  ) {
    return (
      <BackgroundWrapper>
        <Box height="100%" width="100%">
          <WorkspaceSetupPrompt taskId={taskId} task={task} />
        </Box>
      </BackgroundWrapper>
    );
  }

  return (
    <BackgroundWrapper>
      <Flex direction="column" height="100%" width="100%">
        <Box style={{ flex: 1, minHeight: 0 }}>
          <ErrorBoundary name="SessionView">
            <SessionView
              events={events}
              taskId={taskId}
              isRunning={!!isRunning}
              isPromptPending={isCloud ? null : isPromptPending}
              promptStartedAt={isCloud ? undefined : promptStartedAt}
              onSendPrompt={handleSendPrompt}
              onBashCommand={isCloud ? undefined : handleBashCommand}
              onCancelPrompt={handleCancelPrompt}
              repoPath={repoPath}
              cloudBranch={cloudBranch}
              cloudDiffStats={cloudDiffStats}
              hasError={hasError}
              errorTitle={errorTitle}
              errorMessage={errorMessage}
              onRetry={isCloud ? undefined : handleRetry}
              onNewSession={isCloud ? undefined : handleNewSession}
              isInitializing={isInitializing}
              readOnlyMessage={
                isCloudRunTerminal ? "This cloud run has finished" : undefined
              }
              slackThreadUrl={slackThreadUrl}
            />
          </ErrorBoundary>
        </Box>
        {isCloud && (
          <Flex
            align="center"
            justify="center"
            gap="2"
            py="2"
            className="border-gray-4 border-t"
          >
            {prUrl ? (
              <>
                <Text size="2" color="gray">
                  Task completed
                </Text>
                <Button size="2" variant="soft" asChild>
                  <a href={prUrl} target="_blank" rel="noopener noreferrer">
                    View Pull Request
                  </a>
                </Button>
              </>
            ) : isCloudRunNotTerminal ? (
              <>
                <Spinner size="2" />
                <Text size="2" color="gray">
                  Running in cloud
                  {cloudStage ? ` \u2014 ${cloudStage}` : ""}
                  ...
                </Text>
              </>
            ) : cloudStatus === "failed" ? (
              <Text size="2" color="red">
                Task failed
                {cloudErrorMessage ? `: ${cloudErrorMessage}` : ""}
              </Text>
            ) : cloudStatus === "cancelled" ? (
              <Text size="2" color="red">
                Task cancelled
              </Text>
            ) : cloudStatus ? (
              <Text size="2" color="gray">
                Cloud task completed
              </Text>
            ) : null}
          </Flex>
        )}
      </Flex>
    </BackgroundWrapper>
  );
}
