import type { ChangedFile } from "@shared/types";

export type CloudChangesState =
  | { kind: "ready" }
  | { kind: "loading" }
  | { kind: "waiting"; detail: string }
  | { kind: "empty"; message: string }
  | { kind: "pr_error"; prUrl: string };

interface GetCloudChangesStateInput {
  prUrl: string | null;
  effectiveBranch: string | null;
  isRunActive: boolean;
  effectiveFiles: ChangedFile[];
  isLoading: boolean;
  hasError: boolean;
}

export function getCloudChangesState({
  prUrl,
  effectiveBranch,
  isRunActive,
  effectiveFiles,
  isLoading,
  hasError,
}: GetCloudChangesStateInput): CloudChangesState {
  if (!prUrl && !effectiveBranch && effectiveFiles.length === 0) {
    return isRunActive
      ? {
          kind: "waiting",
          detail: "Changes will appear once the agent starts writing code",
        }
      : { kind: "empty", message: "No file changes yet" };
  }

  if (isLoading && effectiveFiles.length === 0) {
    return { kind: "loading" };
  }

  if (effectiveFiles.length === 0) {
    if (hasError && prUrl) {
      return { kind: "pr_error", prUrl };
    }

    if (prUrl) {
      return { kind: "empty", message: "No file changes in pull request" };
    }

    return isRunActive
      ? {
          kind: "waiting",
          detail: "Changes will appear as the agent modifies files",
        }
      : { kind: "empty", message: "No file changes yet" };
  }

  return { kind: "ready" };
}
