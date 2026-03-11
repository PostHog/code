import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { SessionView } from "@features/sessions/components/SessionView";
import { useSessionCallbacks } from "@features/sessions/hooks/useSessionCallbacks";
import { useSessionConnection } from "@features/sessions/hooks/useSessionConnection";
import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useEffect, useMemo } from "react";

interface CommandCenterSessionViewProps {
  taskId: string;
  task: Task;
}

export function CommandCenterSessionView({
  taskId,
  task,
}: CommandCenterSessionViewProps) {
  const session = useSessionForTask(taskId);
  const repoPath = useCwd(taskId);
  const workspace = useWorkspace(taskId);
  const { requestFocus } = useDraftStore((s) => s.actions);

  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";

  useSessionConnection({ taskId, task });

  const {
    handleSendPrompt,
    handleCancelPrompt,
    handleRetry,
    handleNewSession,
    handleBashCommand,
  } = useSessionCallbacks({ taskId, task });

  const isCloudRunNotTerminal =
    isCloud &&
    (!session?.cloudStatus ||
      session.cloudStatus === "started" ||
      session.cloudStatus === "in_progress");

  const isRunning = isCloud
    ? isCloudRunNotTerminal
    : session?.status === "connected";
  const hasError = isCloud ? false : session?.status === "error";

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

  const cloudBranch = isCloud
    ? (workspace?.baseBranch ?? task.latest_run?.branch ?? null)
    : null;

  const readOnlyMessage = useMemo(() => {
    if (!isCloud) return undefined;
    const status = session?.cloudStatus;
    if (
      status === "completed" ||
      status === "failed" ||
      status === "cancelled"
    ) {
      return "This cloud run has finished";
    }
    return undefined;
  }, [isCloud, session?.cloudStatus]);

  useEffect(() => {
    requestFocus(taskId);
  }, [taskId, requestFocus]);

  return (
    <Flex direction="column" height="100%">
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
        hasError={hasError}
        errorTitle={session?.errorTitle}
        errorMessage={session?.errorMessage}
        onRetry={isCloud ? undefined : handleRetry}
        onNewSession={isCloud ? undefined : handleNewSession}
        isInitializing={isInitializing}
        readOnlyMessage={readOnlyMessage}
        compact
      />
    </Flex>
  );
}
