import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateBranchMutate, mockInvalidateGitBranchQueries } = vi.hoisted(
  () => ({
    mockCreateBranchMutate: vi.fn(),
    mockInvalidateGitBranchQueries: vi.fn(),
  }),
);

vi.mock("@renderer/trpc", () => ({
  trpcClient: {
    git: {
      createBranch: {
        mutate: mockCreateBranchMutate,
      },
    },
  },
}));

vi.mock("@features/git-interaction/utils/gitCacheKeys", () => ({
  invalidateGitBranchQueries: mockInvalidateGitBranchQueries,
}));

import { createBranch, getBranchNameInputState } from "./branchCreation";

describe("branchCreation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getBranchNameInputState", () => {
    it("sanitizes spaces and returns no error for valid names", () => {
      expect(getBranchNameInputState("feature my branch")).toEqual({
        sanitized: "feature-my-branch",
        error: null,
      });
    });

    it("returns validation errors for invalid names", () => {
      expect(getBranchNameInputState("feature..branch")).toEqual({
        sanitized: "feature..branch",
        error: 'Branch name cannot contain "..".',
      });
    });
  });

  describe("createBranch", () => {
    it("returns missing-repo error when repo path is not provided", async () => {
      const result = await createBranch({
        repoPath: undefined,
        rawBranchName: "feature/test",
      });

      expect(result).toEqual({
        success: false,
        error: "Select a repository folder first.",
        reason: "missing-repo",
      });
      expect(mockCreateBranchMutate).not.toHaveBeenCalled();
      expect(mockInvalidateGitBranchQueries).not.toHaveBeenCalled();
    });

    it("returns validation error for empty branch name", async () => {
      const result = await createBranch({
        repoPath: "/repo",
        rawBranchName: "   ",
      });

      expect(result).toEqual({
        success: false,
        error: "Branch name is required.",
        reason: "validation",
      });
      expect(mockCreateBranchMutate).not.toHaveBeenCalled();
      expect(mockInvalidateGitBranchQueries).not.toHaveBeenCalled();
    });

    it("returns validation error for invalid branch names", async () => {
      const result = await createBranch({
        repoPath: "/repo",
        rawBranchName: "feature..branch",
      });

      expect(result).toEqual({
        success: false,
        error: 'Branch name cannot contain "..".',
        reason: "validation",
      });
      expect(mockCreateBranchMutate).not.toHaveBeenCalled();
      expect(mockInvalidateGitBranchQueries).not.toHaveBeenCalled();
    });

    it("creates branch with trimmed name and invalidates branch queries", async () => {
      mockCreateBranchMutate.mockResolvedValueOnce(undefined);

      const result = await createBranch({
        repoPath: "/repo",
        rawBranchName: "  feature/test  ",
      });

      expect(mockCreateBranchMutate).toHaveBeenCalledWith({
        directoryPath: "/repo",
        branchName: "feature/test",
      });
      expect(mockInvalidateGitBranchQueries).toHaveBeenCalledWith("/repo");
      expect(result).toEqual({
        success: true,
        branchName: "feature/test",
      });
    });

    it("returns request error with message when mutate throws Error", async () => {
      const error = new Error("boom");
      mockCreateBranchMutate.mockRejectedValueOnce(error);

      const result = await createBranch({
        repoPath: "/repo",
        rawBranchName: "feature/test",
      });

      expect(result).toEqual({
        success: false,
        error: "boom",
        reason: "request",
        rawError: error,
      });
      expect(mockInvalidateGitBranchQueries).not.toHaveBeenCalled();
    });

    it("returns fallback error when mutate throws non-Error value", async () => {
      mockCreateBranchMutate.mockRejectedValueOnce("oops");

      const result = await createBranch({
        repoPath: "/repo",
        rawBranchName: "feature/test",
      });

      expect(result).toEqual({
        success: false,
        error: "Failed to create branch.",
        reason: "request",
        rawError: "oops",
      });
      expect(mockInvalidateGitBranchQueries).not.toHaveBeenCalled();
    });
  });
});
