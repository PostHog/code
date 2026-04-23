import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { invalidateGitBranchQueries } from "@features/git-interaction/utils/gitCacheKeys";
import { useBranchMismatchGuard } from "@features/workspace/hooks/useBranchMismatch";
import { useTRPC } from "@renderer/trpc/client";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { useMutation } from "@tanstack/react-query";
import { track } from "@utils/analytics";
import { logger } from "@utils/logger";
import { useCallback, useRef, useState } from "react";

const log = logger.scope("branch-mismatch");

interface UseBranchMismatchDialogOptions {
  taskId: string;
  repoPath: string | null;
  onSendPrompt: (text: string) => void;
}

export function useBranchMismatchDialog({
  taskId,
  repoPath,
  onSendPrompt,
}: UseBranchMismatchDialogOptions) {
  const { shouldWarn, linkedBranch, currentBranch, dismissWarning } =
    useBranchMismatchGuard(taskId);

  // State drives dialog visibility (`open`), refs avoid stale closures in
  // mutation callbacks (onSuccess / handleContinue) that capture at mount time.
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const pendingMessageRef = useRef<string | null>(null);
  const pendingClearRef = useRef<(() => void) | null>(null);
  const onSendPromptRef = useRef(onSendPrompt);
  onSendPromptRef.current = onSendPrompt;
  const [switchError, setSwitchError] = useState<string | null>(null);

  const { hasChanges: hasUncommittedChanges } = useGitQueries(
    repoPath ?? undefined,
  );

  const trpc = useTRPC();
  const { mutate: checkoutBranch, isPending: isSwitching } = useMutation(
    trpc.git.checkoutBranch.mutationOptions({
      onSuccess: () => {
        if (repoPath) invalidateGitBranchQueries(repoPath);
        dismissWarning();
        pendingClearRef.current?.();
        pendingClearRef.current = null;
        const message = pendingMessageRef.current;
        if (message) onSendPromptRef.current(message);
        setPendingMessage(null);
        pendingMessageRef.current = null;
      },
      onError: (error) => {
        log.error("Failed to switch branch", error);
        setSwitchError(
          error instanceof Error ? error.message : "Failed to switch branch",
        );
      },
    }),
  );

  const handleBeforeSubmit = useCallback(
    (text: string, clearEditor: () => void): boolean => {
      if (shouldWarn) {
        setPendingMessage(text);
        pendingMessageRef.current = text;
        pendingClearRef.current = clearEditor;
        if (linkedBranch && currentBranch) {
          track(ANALYTICS_EVENTS.BRANCH_MISMATCH_WARNING_SHOWN, {
            task_id: taskId,
            linked_branch: linkedBranch,
            current_branch: currentBranch,
            has_uncommitted_changes: hasUncommittedChanges,
          });
        }
        return false;
      }
      return true;
    },
    [shouldWarn, taskId, linkedBranch, currentBranch, hasUncommittedChanges],
  );

  const handleSwitch = useCallback(() => {
    if (!linkedBranch || !repoPath) return;
    setSwitchError(null);
    if (currentBranch) {
      track(ANALYTICS_EVENTS.BRANCH_MISMATCH_ACTION, {
        task_id: taskId,
        action: "switch",
        linked_branch: linkedBranch,
        current_branch: currentBranch,
      });
    }
    checkoutBranch({
      directoryPath: repoPath,
      branchName: linkedBranch,
    });
  }, [linkedBranch, currentBranch, repoPath, taskId, checkoutBranch]);

  const handleContinue = useCallback(() => {
    if (linkedBranch && currentBranch) {
      track(ANALYTICS_EVENTS.BRANCH_MISMATCH_ACTION, {
        task_id: taskId,
        action: "continue",
        linked_branch: linkedBranch,
        current_branch: currentBranch,
      });
    }
    dismissWarning();
    pendingClearRef.current?.();
    pendingClearRef.current = null;
    const message = pendingMessageRef.current;
    if (message) onSendPromptRef.current(message);
    setPendingMessage(null);
    pendingMessageRef.current = null;
    setSwitchError(null);
  }, [dismissWarning, taskId, linkedBranch, currentBranch]);

  const handleCancel = useCallback(() => {
    if (linkedBranch && currentBranch) {
      track(ANALYTICS_EVENTS.BRANCH_MISMATCH_ACTION, {
        task_id: taskId,
        action: "cancel",
        linked_branch: linkedBranch,
        current_branch: currentBranch,
      });
    }
    setPendingMessage(null);
    pendingMessageRef.current = null;
    pendingClearRef.current = null;
    setSwitchError(null);
  }, [taskId, linkedBranch, currentBranch]);

  const dialogProps =
    linkedBranch && currentBranch
      ? {
          open: pendingMessage !== null,
          linkedBranch,
          currentBranch,
          hasUncommittedChanges,
          switchError,
          onSwitch: handleSwitch,
          onContinue: handleContinue,
          onCancel: handleCancel,
          isSwitching,
        }
      : null;

  return { handleBeforeSubmit, dialogProps };
}
