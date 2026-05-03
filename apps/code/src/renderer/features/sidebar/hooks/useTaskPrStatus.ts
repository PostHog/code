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

function mapPrState(
  state: string | null,
  merged: boolean,
  draft: boolean,
): SidebarPrState {
  if (merged) return "merged";
  if (state === "closed") return "closed";
  if (draft) return "draft";
  if (state === "open" || state === "OPEN") return "open";
  return null;
}

/**
 * Per-task hook for sidebar icon state. Uses worktreePath for git queries
 * (worktree tasks have isolated branches). Local-mode tasks only check PR
 * status since their diff stats reflect the shared repo, not the task.
 */
export function useTaskPrStatus(
  task: TaskData,
  worktreePath: string | null,
): TaskPrStatus {
  const trpc = useTRPC();
  const isCloud = task.taskRunEnvironment === "cloud";
  const cloudPrUrl = task.cloudPrUrl;
  const linkedBranch = task.linkedBranch;
  const hasWorktree = !!worktreePath;

  // Cloud tasks: resolve PR state from the PR URL
  const { data: cloudPrDetails } = useQuery(
    trpc.git.getPrDetailsByUrl.queryOptions(
      { prUrl: cloudPrUrl as string },
      {
        enabled: isCloud && !!cloudPrUrl,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  // Local tasks with linked branch: get PR URL first
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

  // Local tasks with linked branch: get PR details from that URL
  const { data: linkedPrDetails } = useQuery(
    trpc.git.getPrDetailsByUrl.queryOptions(
      { prUrl: linkedBranchPrUrl as string },
      {
        enabled: !isCloud && !!linkedBranchPrUrl,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  // Local tasks without linked branch: use getPrStatus (checks current branch)
  const { data: localPrStatus } = useQuery(
    trpc.git.getPrStatus.queryOptions(
      { directoryPath: worktreePath as string },
      {
        enabled: !isCloud && hasWorktree && !linkedBranch,
        staleTime: SIDEBAR_STALE_TIME,
      },
    ),
  );

  // Only query diff stats for worktree tasks (isolated branches).
  // Skip if we already know there's a PR (icon takes priority over hasDiff).
  const knownPrUrl = !!cloudPrUrl || !!linkedBranchPrUrl;
  const knownLocalPr = localPrStatus?.prExists === true;
  const skipDiff = isCloud || !hasWorktree || knownPrUrl || knownLocalPr;

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
    // Derive PR state
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
          localPrStatus.prState.toLowerCase(),
          localPrStatus.prState === "MERGED",
          localPrStatus.isDraft ?? false,
        );
      }
    }

    // hasDiff: uncommitted changes OR commits ahead of default branch
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
