import { CreatePrDialog } from "@features/git-interaction/components/CreatePrDialog";
import {
  GitBranchDialog,
  GitCommitDialog,
  GitPushDialog,
} from "@features/git-interaction/components/GitInteractionDialogs";
import { GitInteractionMenu } from "@features/git-interaction/components/GitInteractionMenu";
import { useGitInteraction } from "@features/git-interaction/hooks/useGitInteraction";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { selectIsFocusedOnWorktree, useFocusStore } from "@stores/focusStore";

interface GitInteractionHeaderProps {
  taskId: string;
}

export function GitInteractionHeader({ taskId }: GitInteractionHeaderProps) {
  const workspace = useWorkspace(taskId);
  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(workspace?.worktreePath ?? ""),
  );
  const repoPath = isFocused
    ? workspace?.folderPath
    : (workspace?.worktreePath ?? workspace?.folderPath);
  const { state, modals, actions } = useGitInteraction(taskId, repoPath);

  return (
    <>
      <div className="no-drag">
        <GitInteractionMenu
          primaryAction={state.primaryAction}
          actions={state.actions}
          isBusy={modals.isSubmitting}
          onPrimary={actions.openAction}
          onSelect={actions.openAction}
        />
      </div>

      <GitCommitDialog
        open={modals.commitOpen}
        onOpenChange={(open) => {
          if (!open) actions.closeCommit();
        }}
        branchName={state.currentBranch}
        diffStats={state.diffStats}
        commitMessage={modals.commitMessage}
        onCommitMessageChange={actions.setCommitMessage}
        nextStep={modals.commitNextStep}
        onNextStepChange={actions.setCommitNextStep}
        pushDisabledReason={state.pushDisabledReason}
        onContinue={actions.runCommit}
        isSubmitting={modals.isSubmitting}
        error={modals.commitError}
        onGenerateMessage={actions.generateCommitMessage}
        isGeneratingMessage={modals.isGeneratingCommitMessage}
      />

      <GitPushDialog
        open={modals.pushOpen}
        onOpenChange={(open) => {
          if (!open) actions.closePush();
        }}
        branchName={state.currentBranch}
        mode={modals.pushMode}
        state={modals.pushState}
        error={modals.pushError}
        onConfirm={actions.runPush}
        onClose={actions.closePush}
        isSubmitting={modals.isSubmitting}
      />

      <CreatePrDialog
        open={modals.createPrOpen}
        onOpenChange={(open) => {
          if (!open) actions.closeCreatePr();
        }}
        currentBranch={modals.createPrBaseBranch}
        diffStats={state.diffStats}
        isSubmitting={modals.isSubmitting}
        onSubmit={actions.runCreatePr}
        onGenerateCommitMessage={actions.generateCommitMessage}
        onGeneratePr={actions.generatePrTitleAndBody}
      />

      <GitBranchDialog
        open={modals.branchOpen}
        onOpenChange={(open) => {
          if (!open) actions.closeBranch();
        }}
        branchName={modals.branchName}
        onBranchNameChange={actions.setBranchName}
        onConfirm={actions.runBranch}
        isSubmitting={modals.isSubmitting}
        error={modals.branchError}
      />
    </>
  );
}
