/**
 * Branch naming conventions.
 * - Reading: Accept all prefixes for backwards compatibility
 * - Writing: Always use BRANCH_PREFIX (posthog-code/)
 */
export const BRANCH_PREFIX = "posthog-code/";
export const LEGACY_BRANCH_PREFIXES = ["twig/", "array/", "posthog/"];

export function isCodeBranch(branchName: string): boolean {
  return (
    branchName.startsWith(BRANCH_PREFIX) ||
    LEGACY_BRANCH_PREFIXES.some((p) => branchName.startsWith(p))
  );
}

export const DATA_DIR = ".posthog-code";
export const WORKTREES_DIR = ".posthog-code/worktrees";
export const LEGACY_DATA_DIRS = [".twig", ".twig/worktrees", ".twig/workspaces", ".array"];
