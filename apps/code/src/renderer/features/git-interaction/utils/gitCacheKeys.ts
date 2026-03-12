import { trpc } from "@renderer/trpc";
import { queryClient } from "@utils/queryClient";

export function invalidateGitWorkingTreeQueries(repoPath: string) {
  const input = { directoryPath: repoPath };
  queryClient.invalidateQueries(
    trpc.git.getChangedFilesHead.queryFilter(input),
  );
  queryClient.invalidateQueries(trpc.git.getDiffStats.queryFilter(input));
}

export function invalidateGitBranchQueries(repoPath: string) {
  const input = { directoryPath: repoPath };
  queryClient.invalidateQueries(trpc.git.getCurrentBranch.queryFilter(input));
  queryClient.invalidateQueries(trpc.git.getAllBranches.queryFilter(input));
  queryClient.invalidateQueries(trpc.git.getGitSyncStatus.queryFilter(input));
  queryClient.invalidateQueries(
    trpc.git.getChangedFilesHead.queryFilter(input),
  );
  queryClient.invalidateQueries(trpc.git.getDiffStats.queryFilter(input));
  queryClient.invalidateQueries(trpc.git.getLatestCommit.queryFilter(input));
  queryClient.invalidateQueries(trpc.git.getPrStatus.queryFilter(input));
  queryClient.invalidateQueries(trpc.git.getFileAtHead.pathFilter());
}
