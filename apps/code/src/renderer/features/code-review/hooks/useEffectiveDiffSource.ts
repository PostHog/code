import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { useLinkedBranchPrUrl } from "@features/git-interaction/hooks/useLinkedBranchPrUrl";
import type { DiffStats } from "@features/git-interaction/utils/diffStats";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import {
  type ResolvedDiffSource,
  resolveDiffSource,
} from "../utils/resolveDiffSource";

export interface EffectiveDiffSource {
  effectiveSource: ResolvedDiffSource;
  prUrl: string | null;
  linkedBranch: string | null;
  defaultBranch: string | null;
  repoSlug: string | null;
  branchSourceAvailable: boolean;
  prSourceAvailable: boolean;
  diffStats: DiffStats;
}

/**
 * Resolves which diff source should be shown for a local task, plus all the
 * context needed to actually fetch that source. Callers (review panel, diff
 * stats badge) share one source-of-truth so UI surfaces never disagree.
 */
export function useEffectiveDiffSource(taskId: string): EffectiveDiffSource {
  const repoPath = useCwd(taskId);
  const workspace = useWorkspace(taskId);
  const linkedBranch = workspace?.linkedBranch ?? null;

  const configured = useDiffViewerStore((s) => s.diffSource[taskId] ?? null);

  const { repoInfo, aheadOfDefault, defaultBranch, changedFiles, diffStats } =
    useGitQueries(repoPath);
  const hasLocalChanges = changedFiles.length > 0;
  const branchSourceAvailable = !!linkedBranch && aheadOfDefault > 0;

  const prUrl = useLinkedBranchPrUrl(taskId);
  const prSourceAvailable = !!prUrl;

  const repoSlug = repoInfo
    ? `${repoInfo.organization}/${repoInfo.repository}`
    : null;

  const effectiveSource = resolveDiffSource({
    configured,
    hasLocalChanges,
    linkedBranch,
    aheadOfDefault,
    prSourceAvailable,
  });

  return {
    effectiveSource,
    prUrl,
    linkedBranch,
    defaultBranch,
    repoSlug,
    branchSourceAvailable,
    prSourceAvailable,
    diffStats,
  };
}
