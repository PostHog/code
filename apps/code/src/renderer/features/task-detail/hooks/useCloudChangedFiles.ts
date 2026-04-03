import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import { useCloudRunState } from "@features/task-detail/hooks/useCloudRunState";
import type { ChangedFile, Task } from "@shared/types";
import { useMemo } from "react";

const EMPTY_FILES: ChangedFile[] = [];

export function useCloudChangedFiles(taskId: string, task: Task) {
  const cloudRunState = useCloudRunState(taskId, task);
  const { prUrl, effectiveBranch, repo, fallbackFiles, isRunActive } =
    cloudRunState;

  const {
    data: prFiles,
    isPending: prPending,
    isError: prError,
  } = useCloudPrChangedFiles(prUrl, isRunActive);

  const {
    data: branchFiles,
    isPending: branchPending,
    isError: branchError,
  } = useCloudBranchChangedFiles(
    !prUrl ? repo : null,
    !prUrl ? effectiveBranch : null,
    isRunActive,
  );

  const remoteFiles = useMemo((): ChangedFile[] => {
    const files = prUrl ? prFiles : branchFiles;
    return files ?? EMPTY_FILES;
  }, [prUrl, prFiles, branchFiles]);

  const isLoading = prUrl ? prPending : effectiveBranch ? branchPending : false;
  const hasError = prUrl ? prError : effectiveBranch ? branchError : false;

  // changedFiles: sidebar list, built from remote with agent output fallback
  // remoteFiles: review panel, always uses PR changes with remote branch fallback
  const changedFiles = remoteFiles.length > 0 ? remoteFiles : fallbackFiles;

  return {
    ...cloudRunState,
    changedFiles,
    remoteFiles,
    isLoading,
    hasError,
  };
}
