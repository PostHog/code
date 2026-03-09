import { describe, expect, it } from "vitest";
import { computeGitInteractionState } from "./gitInteractionLogic";

type GitState = Parameters<typeof computeGitInteractionState>[0];

function makeState(overrides: Partial<GitState> = {}): GitState {
  return {
    repoPath: "/test/repo",
    isRepo: true,
    isRepoLoading: false,
    hasChanges: false,
    aheadOfRemote: 0,
    behind: 0,
    aheadOfDefault: 0,
    hasRemote: true,
    isFeatureBranch: true,
    currentBranch: "feature/test",
    defaultBranch: "main",
    ghStatus: { installed: true, authenticated: true },
    repoInfo: { owner: "test", repo: "test" },
    prStatus: null,
    ...overrides,
  };
}

function actionIds(result: ReturnType<typeof computeGitInteractionState>) {
  return result.actions.map((a) => a.id);
}

describe("computeGitInteractionState", () => {
  describe("on default branch with changes", () => {
    it("returns branch-here as primary action", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: true,
        }),
      );
      expect(result.primaryAction.id).toBe("branch-here");
    });

    it("works without a GitHub remote (defaultBranch null)", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          defaultBranch: null,
          repoInfo: null,
          hasChanges: true,
        }),
      );
      expect(result.primaryAction.id).toBe("branch-here");
    });

    it("includes commit in actions as escape hatch", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: true,
        }),
      );
      expect(actionIds(result)).toEqual(["branch-here", "commit"]);
    });

    it("disables push and pr with feature branch message", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: true,
        }),
      );
      expect(result.pushDisabledReason).toBe("Create a feature branch first.");
      expect(result.prDisabledReason).toBe("Create a feature branch first.");
    });

    it("is not detected as detached head", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: true,
        }),
      );
      expect(result.isDetachedHead).toBe(false);
    });
  });

  describe("on default branch without changes", () => {
    it("uses normal flow with commit as primary", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: false,
        }),
      );
      expect(result.primaryAction.id).toBe("commit");
      expect(result.primaryAction.enabled).toBe(false);
    });

    it("returns standard three actions", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: false,
        }),
      );
      expect(actionIds(result)).toEqual(["commit", "push", "create-pr"]);
    });
  });

  describe("on default branch with ahead commits but no changes", () => {
    it("returns push as primary action", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: false,
          hasChanges: false,
          aheadOfRemote: 2,
        }),
      );
      expect(result.primaryAction.id).toBe("push");
    });
  });

  describe("on feature branch with changes", () => {
    it("returns commit as primary action", () => {
      const result = computeGitInteractionState(
        makeState({ currentBranch: "feature/test", hasChanges: true }),
      );
      expect(result.primaryAction.id).toBe("commit");
    });

    it("returns standard three actions", () => {
      const result = computeGitInteractionState(
        makeState({ currentBranch: "feature/test", hasChanges: true }),
      );
      expect(actionIds(result)).toEqual(["commit", "push", "create-pr"]);
    });
  });

  describe("detached HEAD", () => {
    it("returns branch-here as only action", () => {
      const result = computeGitInteractionState(
        makeState({ currentBranch: null }),
      );
      expect(result.primaryAction.id).toBe("branch-here");
      expect(actionIds(result)).toEqual(["branch-here"]);
    });

    it("is detected as detached head", () => {
      const result = computeGitInteractionState(
        makeState({ currentBranch: null }),
      );
      expect(result.isDetachedHead).toBe(true);
    });
  });

  describe("isFeatureBranch true even on main", () => {
    it("falls through to normal commit flow", () => {
      const result = computeGitInteractionState(
        makeState({
          currentBranch: "main",
          isFeatureBranch: true,
          hasChanges: true,
        }),
      );
      expect(result.primaryAction.id).toBe("commit");
    });
  });

  describe("not a repo", () => {
    it("disables all actions", () => {
      const result = computeGitInteractionState(
        makeState({ isRepo: false, currentBranch: null }),
      );
      expect(result.primaryAction.enabled).toBe(false);
    });
  });
});
