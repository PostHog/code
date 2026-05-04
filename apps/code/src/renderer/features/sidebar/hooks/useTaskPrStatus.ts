import { useTRPC } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { TaskData } from "./useSidebarData";

export type SidebarPrState = "merged" | "open" | "draft" | "closed" | null;

export interface TaskPrStatus {
  prState: SidebarPrState;
  hasDiff: boolean;
}

const SIDEBAR_STALE_TIME = 60_000;
const EMPTY: TaskPrStatus = { prState: null, hasDiff: false };

export function mapPrState(
  state: string | null,
  merged: boolean,
  draft: boolean,
): SidebarPrState {
  const lower = state?.toLowerCase() ?? null;
  if (merged || lower === "merged") return "merged";
  if (lower === "closed") return "closed";
  if (draft) return "draft";
  if (lower === "open") return "open";
  return null;
}

export function useTaskPrStatus(
  task: TaskData,
  worktreePath: string | null,
): TaskPrStatus {
  const trpc = useTRPC();
  const isCloud = task.taskRunEnvironment === "cloud";
  const cloudPrUrl = task.cloudPrUrl;
  const linkedBranch = task.linkedBranch;
  const hasWorktree = !!worktreePath;

  const { data: cloudPrDetails } = useQuery(
    trpc.git.getPrDetailsByUrl.queryOptions(
      { prUrl: cloudPrUrl as string },
      {
        enabled: isCloud && !!cloudPrUrl,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  const { data: linkedBranchPrUrl } = useQuery(
    trpc.git.getPrUrlForBranch.queryOptions(
      {
        directoryPath: worktreePath as string,
        branchName: linkedBranch as string,
      },
      {
        enabled: !isCloud && hasWorktree && !!linkedBranch,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  const { data: linkedPrDetails } = useQuery(
    trpc.git.getPrDetailsByUrl.queryOptions(
      { prUrl: linkedBranchPrUrl as string },
      {
        enabled: !isCloud && !!linkedBranchPrUrl,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  const { data: localPrStatus } = useQuery(
    trpc.git.getPrStatus.queryOptions(
      { directoryPath: worktreePath as string },
      {
        enabled: !isCloud && hasWorktree && !linkedBranch,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  const knownPrUrl = !!cloudPrUrl || !!linkedBranchPrUrl;
  const knownLocalPr = localPrStatus?.prExists === true;
  const skipDiff =
    isCloud || !hasWorktree || knownPrUrl || knownLocalPr || !!linkedBranch;

  const { data: diffStats } = useQuery(
    trpc.git.getDiffStats.queryOptions(
      { directoryPath: worktreePath as string },
      {
        enabled: !skipDiff,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  const { data: syncStatus } = useQuery(
    trpc.git.getGitSyncStatus.queryOptions(
      { directoryPath: worktreePath as string },
      {
        enabled: !skipDiff,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  return useMemo(() => {
    let prState: SidebarPrState = null;

    if (isCloud && cloudPrDetails) {
      prState = mapPrState(
        cloudPrDetails.state,
        cloudPrDetails.merged,
        cloudPrDetails.draft,
      );
    } else if (!isCloud && linkedBranch && linkedPrDetails) {
      prState = mapPrState(
        linkedPrDetails.state,
        linkedPrDetails.merged,
        linkedPrDetails.draft,
      );
    } else if (!isCloud && !linkedBranch && localPrStatus) {
      if (localPrStatus.prExists && localPrStatus.prState) {
        prState = mapPrState(
          localPrStatus.prState,
          false,
          localPrStatus.isDraft ?? false,
        );
      }
    }

    const hasDiff =
      (diffStats?.filesChanged ?? 0) > 0 ||
      (syncStatus?.aheadOfDefault ?? 0) > 0;

    if (!prState && !hasDiff) return EMPTY;
    return { prState, hasDiff };
  }, [
    isCloud,
    cloudPrDetails,
    linkedBranch,
    linkedPrDetails,
    localPrStatus,
    diffStats,
    syncStatus,
  ]);
}
