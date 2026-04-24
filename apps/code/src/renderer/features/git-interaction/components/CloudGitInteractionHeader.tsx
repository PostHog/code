import {
  GitBranchDialog,
  GitCommitDialog,
} from "@features/git-interaction/components/GitInteractionDialogs";
import { useCloudPrUrl } from "@features/git-interaction/hooks/useCloudPrUrl";
import { useGitInteraction } from "@features/git-interaction/hooks/useGitInteraction";
import { usePrActions } from "@features/git-interaction/hooks/usePrActions";
import { usePrDetails } from "@features/git-interaction/hooks/usePrDetails";
import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import { getSuggestedBranchName } from "@features/git-interaction/utils/getSuggestedBranchName";
import {
  getPrVisualConfig,
  parsePrNumber,
} from "@features/git-interaction/utils/prStatus";
import { DirtyTreeDialog } from "@features/sessions/components/DirtyTreeDialog";
import { HandoffConfirmDialog } from "@features/sessions/components/HandoffConfirmDialog";
import { useSessionForTask } from "@features/sessions/hooks/useSession";
import { getLocalHandoffService } from "@features/sessions/service/localHandoffService";
import { useHandoffDialogStore } from "@features/sessions/stores/handoffDialogStore";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Spinner, Text } from "@radix-ui/themes";
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
  const prUrl = useCloudPrUrl(taskId);
  const session = useSessionForTask(taskId);
  const {
    meta: { state, merged, draft },
  } = usePrDetails(prUrl);
  const { execute, isPending } = usePrActions(prUrl);
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

  const config =
    prUrl && state !== null ? getPrVisualConfig(state, merged, draft) : null;
  const prNumber = prUrl ? parsePrNumber(prUrl) : null;
  const hasDropdown = config ? config.actions.length > 0 : false;

  return (
    <Flex align="center" gap="2" className="no-drag">
      <Button
        size="1"
        variant="soft"
        disabled={session?.handoffInProgress}
        onClick={() =>
          localHandoff.openConfirm(taskId, session?.cloudBranch ?? null)
        }
      >
        <Text className="text-[13px] leading-snug">
          {session?.handoffInProgress ? "Transferring..." : "Continue locally"}
        </Text>
      </Button>
      {config && (
        <Flex align="center" gap="0">
          <Button
            size="1"
            variant="soft"
            color={config.color}
            asChild
            style={
              hasDropdown
                ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
                : undefined
            }
          >
            <a href={prUrl ?? ""} target="_blank" rel="noopener noreferrer">
              <Flex align="center" gap="2">
                {isPending ? <Spinner size="1" /> : config.icon}
                <Text className="text-[13px] leading-snug">
                  {config.label}
                  {prNumber && ` #${prNumber}`}
                </Text>
              </Flex>
            </a>
          </Button>
          {hasDropdown && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button
                  size="1"
                  variant="soft"
                  color={config.color}
                  disabled={isPending}
                  style={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderLeft: `1px solid var(--${config.color}-6)`,
                  }}
                  className="pr-[6px] pl-[6px]"
                >
                  <ChevronDownIcon />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content size="1" align="end">
                {config.actions.map((action) => (
                  <DropdownMenu.Item
                    key={action.id}
                    onSelect={() => execute(action.id)}
                  >
                    <Text className="text-[13px] leading-snug">
                      {action.label}
                    </Text>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          )}
        </Flex>
      )}
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
    </Flex>
  );
}
