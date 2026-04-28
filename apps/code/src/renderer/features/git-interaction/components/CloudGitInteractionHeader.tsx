import {
  GitBranchDialog,
  GitCommitDialog,
} from "@features/git-interaction/components/GitInteractionDialogs";
import { useGitInteraction } from "@features/git-interaction/hooks/useGitInteraction";
import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import { getSuggestedBranchName } from "@features/git-interaction/utils/getSuggestedBranchName";
import { DirtyTreeDialog } from "@features/sessions/components/DirtyTreeDialog";
import { HandoffConfirmDialog } from "@features/sessions/components/HandoffConfirmDialog";
import { useSessionForTask } from "@features/sessions/hooks/useSession";
import { getLocalHandoffService } from "@features/sessions/service/localHandoffService";
import { useHandoffDialogStore } from "@features/sessions/stores/handoffDialogStore";
import { Button, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useState } from "react";

interface CloudGitInteractionHeaderProps {
  taskId: string;
  task: Task;
}

export function CloudGitInteractionHeader({
  taskId,
  task,
}: CloudGitInteractionHeaderProps) {
  const session = useSessionForTask(taskId);
  const localHandoff = getLocalHandoffService();

  const confirmOpen = useHandoffDialogStore((s) => s.confirmOpen);
  const direction = useHandoffDialogStore((s) => s.direction);
  const branchName = useHandoffDialogStore((s) => s.branchName);
  const dirtyTreeOpen = useHandoffDialogStore((s) => s.dirtyTreeOpen);
  const changedFiles = useHandoffDialogStore((s) => s.changedFiles);
  const closeConfirm = useHandoffDialogStore((s) => s.closeConfirm);
  const pendingAfterCommit = useHandoffDialogStore((s) => s.pendingAfterCommit);

  const commitRepoPath = pendingAfterCommit?.repoPath;
  const git = useGitInteraction(taskId, commitRepoPath);

  const [isPreflighting, setIsPreflighting] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setPreflightError(null);
    setIsPreflighting(true);
    try {
      await localHandoff.start(taskId, task);
    } catch (err) {
      setPreflightError(
        err instanceof Error ? err.message : "Preflight failed",
      );
    } finally {
      setIsPreflighting(false);
    }
  };

  const handleCommitAndContinue = async () => {
    localHandoff.hideDirtyTree();
    if (git.state.isFeatureBranch) {
      useGitInteractionStore.getState().actions.openCommit("commit");
      return;
    }

    useGitInteractionStore
      .getState()
      .actions.openBranch(getSuggestedBranchName(taskId, commitRepoPath));
  };

  const handleBranchConfirm = async () => {
    const branchCreated = await git.actions.runBranch();
    if (!branchCreated) return;
    useGitInteractionStore.getState().actions.openCommit("commit");
  };

  const handleCommitConfirm = async () => {
    const committed = await git.actions.runCommit();
    if (!committed) return;
    await localHandoff.resumePending();
  };

  return (
    <>
      <Button
        size="1"
        variant="soft"
        disabled={session?.handoffInProgress}
        onClick={() =>
          localHandoff.openConfirm(taskId, session?.cloudBranch ?? null)
        }
      >
        <Text className="text-[13px]">
          {session?.handoffInProgress ? "Transferring..." : "Continue locally"}
        </Text>
      </Button>
      {confirmOpen && direction === "to-local" && (
        <HandoffConfirmDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!open) {
              closeConfirm();
              setPreflightError(null);
            }
          }}
          direction="to-local"
          branchName={branchName}
          onConfirm={handleConfirm}
          isSubmitting={isPreflighting}
          error={preflightError}
        />
      )}
      {dirtyTreeOpen && (
        <DirtyTreeDialog
          open={dirtyTreeOpen}
          onOpenChange={(open) => {
            if (!open) localHandoff.cancelPendingFlow();
          }}
          changedFiles={changedFiles}
          onCommitAndContinue={handleCommitAndContinue}
        />
      )}
      {pendingAfterCommit && (
        <GitCommitDialog
          open={git.modals.commitOpen}
          onOpenChange={(open) => {
            if (!open) {
              git.actions.closeCommit();
              localHandoff.cancelPendingFlow();
            }
          }}
          branchName={git.state.currentBranch ?? pendingAfterCommit.branchName}
          diffStats={git.state.diffStats}
          commitMessage={git.modals.commitMessage}
          onCommitMessageChange={git.actions.setCommitMessage}
          nextStep={git.modals.commitNextStep}
          onNextStepChange={git.actions.setCommitNextStep}
          pushDisabledReason={git.state.pushDisabledReason}
          onContinue={handleCommitConfirm}
          isSubmitting={git.modals.isSubmitting}
          error={git.modals.commitError}
          onGenerateMessage={git.actions.generateCommitMessage}
          isGeneratingMessage={git.modals.isGeneratingCommitMessage}
          showCommitAllToggle={
            git.state.stagedFiles.length > 0 &&
            git.state.unstagedFiles.length > 0
          }
          commitAll={git.modals.commitAll}
          onCommitAllChange={git.actions.setCommitAll}
          stagedFileCount={git.state.stagedFiles.length}
        />
      )}
      {pendingAfterCommit && (
        <GitBranchDialog
          open={git.modals.branchOpen}
          onOpenChange={(open) => {
            if (!open) {
              git.actions.closeBranch();
              localHandoff.cancelPendingFlow();
            }
          }}
          branchName={git.modals.branchName}
          onBranchNameChange={git.actions.setBranchName}
          onConfirm={handleBranchConfirm}
          isSubmitting={git.modals.isSubmitting}
          error={git.modals.branchError}
        />
      )}
    </>
  );
}
