import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import { useCloudRunState } from "@features/task-detail/hooks/useCloudRunState";
import type { ChangedFile, Task } from "@shared/types";
import { useMemo } from "react";

const EMPTY_FILES: ChangedFile[] = [];

export function useCloudChangedFiles(
  taskId: string,
  task: Task,
  isActive = true,
) {
  const cloudRunState = useCloudRunState(taskId, task);
  const { prUrl, effectiveBranch, repo, isRunActive } = cloudRunState;

  const {
    data: prFiles,
    isPending: prPending,
    isError: prError,
  } = useCloudPrChangedFiles(isActive ? prUrl : null, isRunActive);

  const {
    data: branchFiles,
    isPending: branchPending,
    isError: branchError,
  } = useCloudBranchChangedFiles(
    isActive && !prUrl ? repo : null,
    isActive && !prUrl ? effectiveBranch : null,
    isRunActive,
  );

  const remoteFiles = useMemo((): ChangedFile[] => {
    const files = prUrl ? prFiles : branchFiles;
    return files ?? EMPTY_FILES;
  }, [prUrl, prFiles, branchFiles]);

  const isLoading = prUrl ? prPending : effectiveBranch ? branchPending : false;
  const hasError = prUrl ? prError : effectiveBranch ? branchError : false;

  // changedFiles: sidebar list — prefers remote, falls back to tree snapshot (which
  // has complete file status coverage) or tool calls.
  const changedFiles =
    remoteFiles.length > 0 ? remoteFiles : cloudRunState.fallbackFiles;

  // reviewFiles: review panel diffs and +/- stats. Tool calls carry patches and line
  // counts, so they're preferred over tree snapshots (path+status only) when remote
  // data isn't available yet.
  const reviewFiles =
    remoteFiles.length > 0 ? remoteFiles : cloudRunState.toolCallFiles;

  return {
    ...cloudRunState,
    changedFiles,
    remoteFiles,
    reviewFiles,
    isLoading,
    hasError,
  };
}
