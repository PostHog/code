import type { DiffSource } from "@features/code-editor/stores/diffViewerStore";

export type ResolvedDiffSource = DiffSource;

export interface ResolveDiffSourceInput {
  configured: DiffSource | null;
  hasLocalChanges: boolean;
  linkedBranch: string | null;
  aheadOfDefault: number;
}

export function resolveDiffSource({
  configured,
  hasLocalChanges,
  linkedBranch,
  aheadOfDefault,
}: ResolveDiffSourceInput): ResolvedDiffSource {
  const branchAvailable = !!linkedBranch && aheadOfDefault > 0;

  if (configured === "branch") {
    return branchAvailable ? "branch" : "local";
  }
  if (configured === "local") {
    return "local";
  }

  if (hasLocalChanges) return "local";
  if (branchAvailable) return "branch";
  return "local";
}
