import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import { useCloudRunState } from "@features/task-detail/hooks/useCloudRunState";
import type { ChangedFile, Task } from "@shared/types";

export function useCloudChangedFiles(taskId: string, task: Task) {
  const cloudRunState = useCloudRunState(taskId, task);
  const { prUrl, effectiveBranch, repo, fallbackFiles } = cloudRunState;

  const {
    data: prFiles,
    isPending: prPending,
    isError: prError,
  } = useCloudPrChangedFiles(prUrl);

  const {
    data: branchFiles,
    isPending: branchPending,
    isError: branchError,
  } = useCloudBranchChangedFiles(
    !prUrl ? repo : null,
    !prUrl ? effectiveBranch : null,
  );

  const remoteFiles: ChangedFile[] = prUrl
    ? (prFiles ?? [])
    : (branchFiles ?? []);
  const isLoading = prUrl ? prPending : effectiveBranch ? branchPending : false;
  const hasError = prUrl ? prError : effectiveBranch ? branchError : false;

  const changedFiles = remoteFiles.length > 0 ? remoteFiles : fallbackFiles;

  return {
    ...cloudRunState,
    changedFiles,
    isLoading,
    hasError,
  };
}
