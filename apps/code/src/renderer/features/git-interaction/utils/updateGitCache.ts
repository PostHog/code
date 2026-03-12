import type { GitStateSnapshot } from "@main/services/git/schemas";
import { trpc } from "@renderer/trpc";
import type { QueryClient } from "@tanstack/react-query";

export function updateGitCacheFromSnapshot(
  queryClient: QueryClient,
  repoPath: string,
  snapshot: GitStateSnapshot,
): void {
  const input = { directoryPath: repoPath };

  if (snapshot.changedFiles !== undefined) {
    queryClient.setQueryData(
      trpc.git.getChangedFilesHead.queryKey(input),
      snapshot.changedFiles,
    );
  }

  if (snapshot.diffStats !== undefined) {
    queryClient.setQueryData(
      trpc.git.getDiffStats.queryKey(input),
      snapshot.diffStats,
    );
  }

  if (snapshot.syncStatus !== undefined) {
    queryClient.setQueryData(
      trpc.git.getGitSyncStatus.queryKey(input),
      snapshot.syncStatus,
    );
    if (snapshot.syncStatus.currentBranch !== undefined) {
      queryClient.setQueryData(
        trpc.git.getCurrentBranch.queryKey(input),
        snapshot.syncStatus.currentBranch,
      );
    }
  }

  if (snapshot.latestCommit !== undefined) {
    queryClient.setQueryData(
      trpc.git.getLatestCommit.queryKey(input),
      snapshot.latestCommit,
    );
  }

  if (snapshot.prStatus !== undefined) {
    queryClient.setQueryData(
      trpc.git.getPrStatus.queryKey(input),
      snapshot.prStatus,
    );
  }
}
