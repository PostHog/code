import { BackgroundWrapper } from "@components/BackgroundWrapper";
import { ErrorBoundary } from "@components/ErrorBoundary";
import { useFolders } from "@features/folders/hooks/useFolders";
import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import { computeDiffStats } from "@features/git-interaction/utils/diffStats";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { ProvisioningView } from "@features/provisioning/components/ProvisioningView";
import { useProvisioningStore } from "@features/provisioning/stores/provisioningStore";
import { SessionView } from "@features/sessions/components/SessionView";
import { useSessionCallbacks } from "@features/sessions/hooks/useSessionCallbacks";
import { useSessionConnection } from "@features/sessions/hooks/useSessionConnection";
import { useSessionViewState } from "@features/sessions/hooks/useSessionViewState";
import { useRestoreTask } from "@features/suspension/hooks/useRestoreTask";
import { useSuspendedTaskIds } from "@features/suspension/hooks/useSuspendedTaskIds";
import { WorkspaceSetupPrompt } from "@features/task-detail/components/WorkspaceSetupPrompt";
import {
  useCreateWorkspace,
  useWorkspaceLoaded,
} from "@features/workspace/hooks/useWorkspace";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { getTaskRepository } from "@utils/repository";
import { useCallback, useEffect, useMemo } from "react";

interface TaskLogsPanelProps {
  taskId: string;
  task: Task;
}

export function TaskLogsPanel({ taskId, task }: TaskLogsPanelProps) {
  const isWorkspaceLoaded = useWorkspaceLoaded();
  const { isPending: isCreatingWorkspace } = useCreateWorkspace();
  const repoKey = getTaskRepository(task);
  const { folders } = useFolders();
  const hasDirectoryMapping = repoKey
    ? folders.some((f) => f.remoteUrl === repoKey)
    : false;

  const suspendedTaskIds = useSuspendedTaskIds();
  const isSuspended = suspendedTaskIds.has(taskId);
  const { restoreTask, isRestoring } = useRestoreTask();

  const isProvisioning = useProvisioningStore((s) => s.activeTasks.has(taskId));

  const { requestFocus } = useDraftStore((s) => s.actions);

  const {
    session,
    repoPath,
    isCloud,
    isCloudRunNotTerminal,
    cloudStatus,
    isRunning,
    hasError,
    events,
    isPromptPending,
    promptStartedAt,
    isInitializing,
    cloudBranch,
    errorTitle,
    errorMessage,
  } = useSessionViewState(taskId, task);

  useSessionConnection({
    taskId,
    task,
    session,
    repoPath,
    isCloud,
    isSuspended,
  });

  const {
    handleSendPrompt,
    handleCancelPrompt,
    handleRetry,
    handleNewSession,
    handleBashCommand,
  } = useSessionCallbacks({ taskId, task, session, repoPath });

  const cloudStage = session?.cloudStage ?? null;
  const cloudOutput = session?.cloudOutput ?? null;
  const cloudErrorMessage = session?.cloudErrorMessage ?? null;
  const prUrl =
    isCloud && cloudOutput?.pr_url ? (cloudOutput.pr_url as string) : null;
  const slackThreadUrl =
    typeof task.latest_run?.state?.slack_thread_url === "string"
      ? task.latest_run.state.slack_thread_url
      : undefined;

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
    return computeDiffStats(files);
  }, [isCloud, prUrl, prFiles, branchFiles]);

  useEffect(() => {
    requestFocus(taskId);
  }, [taskId, requestFocus]);

  const handleRestoreWorktree = useCallback(async () => {
    await restoreTask(taskId);
  }, [taskId, restoreTask]);

  if (isProvisioning) {
    return <ProvisioningView taskId={taskId} />;
  }

  if (
    !repoPath &&
    !isCloud &&
    !isSuspended &&
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
              isRunning={isRunning}
              isSuspended={isSuspended}
              onRestoreWorktree={
                isSuspended ? handleRestoreWorktree : undefined
              }
              isRestoring={isRestoring}
              isPromptPending={isPromptPending}
              promptStartedAt={promptStartedAt}
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
