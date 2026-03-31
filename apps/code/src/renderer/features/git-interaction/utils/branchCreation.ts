import {
  sanitizeBranchName,
  validateBranchName,
} from "@features/git-interaction/utils/branchNameValidation";
import { invalidateGitBranchQueries } from "@features/git-interaction/utils/gitCacheKeys";
import { trpcClient } from "@renderer/trpc";

export interface BranchNameInputState {
  sanitized: string;
  error: string | null;
}

export type CreateBranchResult =
  | {
      success: true;
      branchName: string;
    }
  | {
      success: false;
      error: string;
      reason: "missing-repo" | "validation" | "request";
      rawError?: unknown;
    };

interface CreateBranchInput {
  repoPath?: string;
  rawBranchName: string;
}

function getCreateBranchError(error: unknown): string {
  return error instanceof Error ? error.message : "Failed to create branch.";
}

export function getBranchNameInputState(value: string): BranchNameInputState {
  const sanitized = sanitizeBranchName(value);
  return {
    sanitized,
    error: validateBranchName(sanitized),
  };
}

export async function createBranch({
  repoPath,
  rawBranchName,
}: CreateBranchInput): Promise<CreateBranchResult> {
  if (!repoPath) {
    return {
      success: false,
      error: "Select a repository folder first.",
      reason: "missing-repo",
    };
  }

  const branchName = rawBranchName.trim();
  if (!branchName) {
    return {
      success: false,
      error: "Branch name is required.",
      reason: "validation",
    };
  }

  const validationError = validateBranchName(branchName);
  if (validationError) {
    return {
      success: false,
      error: validationError,
      reason: "validation",
    };
  }

  try {
    await trpcClient.git.createBranch.mutate({
      directoryPath: repoPath,
      branchName,
    });

    invalidateGitBranchQueries(repoPath);

    return {
      success: true,
      branchName,
    };
  } catch (error) {
    return {
      success: false,
      error: getCreateBranchError(error),
      reason: "request",
      rawError: error,
    };
  }
}
