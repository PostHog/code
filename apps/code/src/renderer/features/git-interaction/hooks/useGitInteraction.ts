import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { computeGitInteractionState } from "@features/git-interaction/state/gitInteractionLogic";
import {
  type GitInteractionStore,
  useGitInteractionStore,
} from "@features/git-interaction/state/gitInteractionStore";
import type {
  CommitNextStep,
  GitMenuAction,
  GitMenuActionId,
} from "@features/git-interaction/types";
import {
  createBranch,
  getBranchNameInputState,
} from "@features/git-interaction/utils/branchCreation";
import { invalidateGitBranchQueries } from "@features/git-interaction/utils/gitCacheKeys";
import { updateGitCacheFromSnapshot } from "@features/git-interaction/utils/updateGitCache";
import { trpc, trpcClient } from "@renderer/trpc";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { useQueryClient } from "@tanstack/react-query";
import { track } from "@utils/analytics";
import { logger } from "@utils/logger";
import { useMemo } from "react";
import { sanitizeBranchName } from "../utils/branchNameValidation";
import { getSuggestedBranchName } from "../utils/getSuggestedBranchName";

const log = logger.scope("git-interaction");

export type { GitMenuAction, GitMenuActionId };

interface GitInteractionState {
  primaryAction: GitMenuAction;
  actions: GitMenuAction[];
  hasChanges: boolean;
  aheadOfRemote: number;
  behind: number;
  currentBranch: string | null;
  defaultBranch: string | null;
  prBaseBranch: string | null;
  prHeadBranch: string | null;
  diffStats: { filesChanged: number; linesAdded: number; linesRemoved: number };
  prUrl: string | null;
  pushDisabledReason: string | null;
  isLoading: boolean;
}

interface GitInteractionActions {
  openAction: (actionId: GitMenuActionId) => void;
  closeCommit: () => void;
  closePush: () => void;
  closeBranch: () => void;
  setCommitMessage: (value: string) => void;
  setCommitNextStep: (value: CommitNextStep) => void;
  setPrTitle: (value: string) => void;
  setPrBody: (value: string) => void;
  setBranchName: (value: string) => void;
  runCommit: () => Promise<void>;
  runPush: () => Promise<void>;
  runBranch: () => Promise<void>;
  runCreatePr: () => Promise<void>;
  generateCommitMessage: () => Promise<void>;
  generatePrTitleAndBody: () => Promise<void>;
  closeCreatePr: () => void;
  setCreatePrBranchName: (value: string) => void;
  setCreatePrDraft: (value: boolean) => void;
}

function trackGitAction(taskId: string, actionType: string, success: boolean) {
  track(ANALYTICS_EVENTS.GIT_ACTION_EXECUTED, {
    action_type: actionType as
      | "commit"
      | "push"
      | "sync"
      | "publish"
      | "create-pr"
      | "view-pr"
      | "update-pr",
    success,
    task_id: taskId,
  });
}

export function useGitInteraction(
  taskId: string,
  repoPath?: string,
): {
  state: GitInteractionState;
  modals: GitInteractionStore;
  actions: GitInteractionActions;
} {
  const queryClient = useQueryClient();
  const store = useGitInteractionStore();
  const { actions: modal } = store;

  const git = useGitQueries(repoPath);

  const computed = useMemo(
    () =>
      computeGitInteractionState({
        repoPath,
        isRepo: git.isRepo,
        isRepoLoading: git.isRepoLoading,
        hasChanges: git.hasChanges,
        aheadOfRemote: git.aheadOfRemote,
        behind: git.behind,
        aheadOfDefault: git.aheadOfDefault,
        hasRemote: git.hasRemote,
        isFeatureBranch: git.isFeatureBranch,
        currentBranch: git.currentBranch,
        defaultBranch: git.defaultBranch,
        ghStatus: git.ghStatus ?? null,
        repoInfo: git.repoInfo ?? null,
        prStatus: git.prStatus ?? null,
      }),
    [
      repoPath,
      git.isRepo,
      git.isRepoLoading,
      git.hasChanges,
      git.aheadOfRemote,
      git.behind,
      git.aheadOfDefault,
      git.hasRemote,
      git.isFeatureBranch,
      git.currentBranch,
      git.defaultBranch,
      git.ghStatus,
      git.repoInfo,
      git.prStatus,
    ],
  );

  const openCreatePr = () => {
    const prExists = git.prStatus?.prExists ?? false;
    const needsBranch = !git.isFeatureBranch || prExists;
    const needsCommit = git.hasChanges;
    modal.openCreatePr({
      needsBranch,
      needsCommit,
      baseBranch: git.currentBranch,
      suggestedBranchName: needsBranch
        ? getSuggestedBranchName(taskId, repoPath)
        : undefined,
    });
  };

  const runCreatePr = async () => {
    if (!repoPath) return;

    if (store.createPrNeedsBranch && !store.branchName.trim()) {
      modal.setCreatePrError("Branch name is required.");
      return;
    }

    modal.setIsSubmitting(true);
    modal.setCreatePrError(null);
    modal.setCreatePrStep("idle");
    modal.setCreatePrFailedStep(null);

    const flowId = crypto.randomUUID();

    const subscription = trpcClient.git.onCreatePrProgress.subscribe(
      undefined,
      {
        onData: (data) => {
          if (data.flowId !== flowId) return;
          if (useGitInteractionStore.getState().createPrStep === data.step)
            return;
          modal.setCreatePrStep(data.step);
        },
      },
    );

    try {
      const result = await trpcClient.git.createPr.mutate({
        directoryPath: repoPath,
        flowId,
        branchName: store.createPrNeedsBranch
          ? store.branchName.trim()
          : undefined,
        commitMessage: store.commitMessage.trim() || undefined,
        prTitle: store.prTitle.trim() || undefined,
        prBody: store.prBody.trim() || undefined,
        draft: store.createPrDraft || undefined,
      });

      if (!result.success) {
        trackGitAction(taskId, "create-pr", false);
        useGitInteractionStore.setState({
          createPrError: result.message,
          createPrFailedStep: result.failedStep ?? null,
          createPrStep: "error",
        });
        return;
      }

      trackGitAction(taskId, "create-pr", true);
      track(ANALYTICS_EVENTS.PR_CREATED, { task_id: taskId, success: true });

      if (result.state) {
        updateGitCacheFromSnapshot(queryClient, repoPath, result.state);
      }
      if (store.createPrNeedsBranch) {
        invalidateGitBranchQueries(repoPath);
      }

      if (result.prUrl) {
        await trpcClient.os.openExternal.mutate({ url: result.prUrl });
      }

      modal.closeCreatePr();
    } catch (error) {
      log.error("Create PR flow failed", error);
      useGitInteractionStore.setState({
        createPrFailedStep: useGitInteractionStore.getState().createPrStep,
        createPrError:
          error instanceof Error ? error.message : "Create PR flow failed.",
        createPrStep: "error",
      });
    } finally {
      subscription.unsubscribe();
      modal.setIsSubmitting(false);
    }
  };

  const openAction = (id: GitMenuActionId) => {
    const actionMap: Record<GitMenuActionId, () => void> = {
      commit: () => modal.openCommit("commit"),
      push: () => modal.openPush("push"),
      sync: () => modal.openPush("sync"),
      publish: () => modal.openPush("publish"),
      "view-pr": () => viewPr(),
      "create-pr": () => openCreatePr(),
      "branch-here": () =>
        modal.openBranch(getSuggestedBranchName(taskId, repoPath)),
    };
    actionMap[id]();
  };

  const viewPr = async () => {
    if (!repoPath) return;
    const result = await trpcClient.git.openPr.mutate({
      directoryPath: repoPath,
    });
    if (result.success && result.prUrl) {
      await trpcClient.os.openExternal.mutate({ url: result.prUrl });
    }
  };

  const runCommit = async () => {
    if (!repoPath) return;

    if (store.commitNextStep === "commit-push" && computed.pushDisabledReason) {
      modal.setCommitError(computed.pushDisabledReason);
      return;
    }

    modal.setIsSubmitting(true);
    modal.setCommitError(null);

    let message = store.commitMessage.trim();

    if (!message) {
      try {
        const generated = await trpcClient.git.generateCommitMessage.mutate({
          directoryPath: repoPath,
        });

        if (!generated.message) {
          modal.setCommitError(
            "No changes detected to generate a commit message.",
          );
          modal.setIsSubmitting(false);
          return;
        }

        message = generated.message;
        modal.setCommitMessage(message);
      } catch (error) {
        log.error("Failed to generate commit message", error);
        modal.setCommitError(
          error instanceof Error
            ? error.message
            : "Failed to generate commit message.",
        );
        modal.setIsSubmitting(false);
        return;
      }
    }

    try {
      const result = await trpcClient.git.commit.mutate({
        directoryPath: repoPath,
        message,
      });

      if (!result.success) {
        trackGitAction(taskId, "commit", false);
        modal.setCommitError(result.message || "Commit failed.");
        return;
      }

      trackGitAction(taskId, "commit", true);

      if (result.state) {
        updateGitCacheFromSnapshot(queryClient, repoPath, result.state);
      }

      modal.setCommitMessage("");
      modal.closeCommit();

      if (store.commitNextStep === "commit-push") {
        modal.openPush(git.hasRemote ? "push" : "publish");
      }
    } finally {
      modal.setIsSubmitting(false);
    }
  };

  const runPush = async () => {
    if (!repoPath) return;

    modal.setIsSubmitting(true);
    modal.setPushError(null);

    try {
      const pushFn =
        store.pushMode === "sync"
          ? trpcClient.git.sync
          : store.pushMode === "publish"
            ? trpcClient.git.publish
            : trpcClient.git.push;

      const result = await pushFn.mutate({ directoryPath: repoPath });

      if (!result.success) {
        const message =
          "message" in result
            ? result.message
            : `Pull: ${result.pullMessage}, Push: ${result.pushMessage}`;
        trackGitAction(taskId, store.pushMode, false);
        modal.setPushError(message || "Push failed.");
        modal.setPushState("error");
        return;
      }

      trackGitAction(taskId, store.pushMode, true);

      if (result.state) {
        updateGitCacheFromSnapshot(queryClient, repoPath, result.state);
      }

      modal.setPushState("success");
    } finally {
      modal.setIsSubmitting(false);
    }
  };

  const generateCommitMessage = async () => {
    if (!repoPath) return;

    modal.setIsGeneratingCommitMessage(true);
    modal.setCommitError(null);

    try {
      const result = await trpcClient.git.generateCommitMessage.mutate({
        directoryPath: repoPath,
      });

      if (result.message) {
        modal.setCommitMessage(result.message);
      } else {
        modal.setCommitError(
          "No changes detected to generate a commit message.",
        );
      }
    } catch (error) {
      log.error("Failed to generate commit message", error);
      modal.setCommitError(
        error instanceof Error
          ? error.message
          : "Failed to generate commit message.",
      );
    } finally {
      modal.setIsGeneratingCommitMessage(false);
    }
  };

  const generatePrTitleAndBody = async () => {
    if (!repoPath) return;

    modal.setIsGeneratingPr(true);
    modal.setCreatePrError(null);

    try {
      const result = await trpcClient.git.generatePrTitleAndBody.mutate({
        directoryPath: repoPath,
      });

      if (result.title || result.body) {
        modal.setPrTitle(result.title);
        modal.setPrBody(result.body);
      } else {
        modal.setCreatePrError(
          "No changes detected to generate PR description.",
        );
      }
    } catch (error) {
      log.error("Failed to generate PR title and body", error);
      modal.setCreatePrError(
        error instanceof Error
          ? error.message
          : "Failed to generate PR description.",
      );
    } finally {
      modal.setIsGeneratingPr(false);
    }
  };

  const runBranch = async () => {
    if (!repoPath) return;

    modal.setIsSubmitting(true);
    modal.setBranchError(null);

    try {
      const result = await createBranch({
        repoPath,
        rawBranchName: store.branchName,
      });
      if (!result.success) {
        if (result.reason === "request") {
          log.error("Failed to create branch", result.rawError ?? result.error);
          trackGitAction(taskId, "branch-here", false);
        }

        modal.setBranchError(result.error);
        return;
      }

      trackGitAction(taskId, "branch-here", true);
      await queryClient.invalidateQueries(trpc.workspace.getAll.pathFilter());

      modal.closeBranch();
    } catch (error) {
      log.error("Failed to create branch", error);
      trackGitAction(taskId, "branch-here", false);
      modal.setBranchError(
        error instanceof Error ? error.message : "Failed to create branch.",
      );
    } finally {
      modal.setIsSubmitting(false);
    }
  };

  return {
    state: {
      primaryAction: computed.primaryAction,
      actions: computed.actions,
      hasChanges: git.hasChanges,
      aheadOfRemote: git.aheadOfRemote,
      behind: git.behind,
      currentBranch: git.currentBranch,
      defaultBranch: git.defaultBranch,
      prBaseBranch: computed.prBaseBranch,
      prHeadBranch: computed.prHeadBranch,
      diffStats: git.diffStats,
      prUrl: computed.prUrl,
      pushDisabledReason: computed.pushDisabledReason,
      isLoading: git.isLoading,
    },
    modals: store,
    actions: {
      openAction,
      closeCommit: modal.closeCommit,
      closePush: modal.closePush,
      closeBranch: modal.closeBranch,
      setCommitMessage: modal.setCommitMessage,
      setCommitNextStep: modal.setCommitNextStep,
      setPrTitle: modal.setPrTitle,
      setPrBody: modal.setPrBody,
      setBranchName: (value: string) => {
        const { sanitized, error } = getBranchNameInputState(value);
        modal.setBranchName(sanitized);
        modal.setBranchError(error);
      },
      runCommit,
      runPush,
      runBranch,
      runCreatePr,
      generateCommitMessage,
      generatePrTitleAndBody,
      closeCreatePr: modal.closeCreatePr,
      setCreatePrBranchName: (value: string) => {
        const sanitized = sanitizeBranchName(value);
        modal.setBranchName(sanitized);
      },
      setCreatePrDraft: modal.setCreatePrDraft,
    },
  };
}
