import {
  ErrorContainer,
  GenerateButton,
} from "@features/git-interaction/components/GitInteractionDialogs";
import { useFixWithAgent } from "@features/git-interaction/hooks/useFixWithAgent";
import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import type { CreatePrStep } from "@features/git-interaction/types";
import type { DiffStats } from "@features/git-interaction/utils/diffStats";
import { buildCreatePrFlowErrorPrompt } from "@features/git-interaction/utils/errorPrompts";
import {
  CheckCircle,
  Circle,
  GitPullRequest,
  XCircle,
} from "@phosphor-icons/react";
import {
  Button,
  Checkbox,
  Dialog,
  Flex,
  Spinner,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";

const ICON_SIZE = 14;

interface StepDef {
  id: CreatePrStep;
  label: string;
}

function StepIndicator({
  steps,
  currentStep,
  failedStep,
}: {
  steps: StepDef[];
  currentStep: CreatePrStep;
  failedStep?: CreatePrStep | null;
}) {
  const stepOrder: CreatePrStep[] = [
    "creating-branch",
    "committing",
    "pushing",
    "creating-pr",
    "complete",
  ];

  const currentIndex = stepOrder.indexOf(currentStep);
  const isError = currentStep === "error";

  return (
    <Flex direction="column" gap="3">
      {steps.map((step) => {
        const stepIndex = stepOrder.indexOf(step.id);
        const isComplete =
          currentStep === "complete" || stepIndex < currentIndex;
        const isActive = step.id === currentStep;
        const isFailed = isError && step.id === failedStep;

        let icon: React.ReactNode;
        if (isFailed) {
          icon = <XCircle size={16} weight="fill" color="var(--red-9)" />;
        } else if (isComplete) {
          icon = <CheckCircle size={16} weight="fill" color="var(--green-9)" />;
        } else if (isActive) {
          icon = <Spinner size="1" />;
        } else {
          icon = <Circle size={16} color="var(--gray-6)" />;
        }

        return (
          <Flex
            key={step.id}
            align="center"
            gap="2"
            style={{
              transition: "opacity 150ms ease",
              opacity: isComplete ? 0.6 : 1,
            }}
          >
            <Flex
              style={{
                transition: "transform 200ms ease",
                transform: isActive ? "scale(1.15)" : "scale(1)",
              }}
            >
              {icon}
            </Flex>
            <Text
              size="2"
              weight={isActive ? "medium" : "regular"}
              style={{
                transition: "color 150ms ease",
                color: isFailed
                  ? "var(--red-11)"
                  : isComplete
                    ? "var(--green-11)"
                    : isActive
                      ? "var(--gray-12)"
                      : "var(--gray-9)",
              }}
            >
              {step.label}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

export interface CreatePrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentBranch: string | null;
  diffStats: DiffStats;
  isSubmitting: boolean;
  onSubmit: () => void;
  onGenerateCommitMessage: () => void;
  onGeneratePr: () => void;
}

export function CreatePrDialog({
  open,
  onOpenChange,
  currentBranch,
  diffStats,
  isSubmitting,
  onSubmit,
  onGenerateCommitMessage,
  onGeneratePr,
}: CreatePrDialogProps) {
  const store = useGitInteractionStore();
  const { actions } = store;
  const { canFixWithAgent, fixWithAgent } = useFixWithAgent(() =>
    buildCreatePrFlowErrorPrompt(store.createPrFailedStep),
  );

  const { createPrStep: step } = store;
  const isExecuting = step !== "idle" && step !== "complete";

  // Build the step list based on what's needed
  const steps: StepDef[] = [];
  if (store.createPrNeedsBranch) {
    steps.push({
      id: "creating-branch",
      label: `Create branch ${store.branchName || ""}`.trim(),
    });
  }
  if (store.createPrNeedsCommit) {
    steps.push({ id: "committing", label: "Commit changes" });
  }
  steps.push({ id: "pushing", label: "Push to remote" });
  steps.push({ id: "creating-pr", label: "Create pull request" });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="500px" size="1">
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <GitPullRequest size={ICON_SIZE} />
            <Text size="2" weight="medium">
              {isExecuting ? "Creating PR..." : "Create PR"}
            </Text>
          </Flex>

          {!isExecuting && (
            <>
              {store.createPrNeedsBranch && (
                <Flex direction="column" gap="1">
                  <Text size="1" color="gray">
                    Branch
                  </Text>
                  <TextField.Root
                    value={store.branchName}
                    onChange={(e) => actions.setBranchName(e.target.value)}
                    placeholder="branch-name"
                    size="1"
                    autoFocus
                  />
                  {currentBranch && (
                    <Text size="1" color="gray">
                      from {currentBranch}
                    </Text>
                  )}
                </Flex>
              )}

              {store.createPrNeedsCommit && (
                <Flex direction="column" gap="1">
                  <Flex align="center" justify="between">
                    <Text size="1" color="gray">
                      Commit message
                    </Text>
                    <Flex align="center" gap="2">
                      <Text size="1" color="gray">
                        {diffStats.filesChanged} file
                        {diffStats.filesChanged === 1 ? "" : "s"}
                      </Text>
                      <Text size="1" color="green">
                        +{diffStats.linesAdded}
                      </Text>
                      <Text size="1" color="red">
                        -{diffStats.linesRemoved}
                      </Text>
                      <GenerateButton
                        onClick={onGenerateCommitMessage}
                        isGenerating={store.isGeneratingCommitMessage}
                      />
                    </Flex>
                  </Flex>
                  <TextArea
                    value={store.commitMessage}
                    onChange={(e) => actions.setCommitMessage(e.target.value)}
                    placeholder="Leave empty to generate"
                    size="1"
                    rows={1}
                    disabled={store.isGeneratingCommitMessage}
                    autoFocus={!store.createPrNeedsBranch}
                  />
                </Flex>
              )}

              <Flex direction="column" gap="1">
                <Flex align="center" justify="between">
                  <Text size="1" color="gray">
                    PR title
                  </Text>
                  <GenerateButton
                    onClick={onGeneratePr}
                    isGenerating={store.isGeneratingPr}
                  />
                </Flex>
                <TextField.Root
                  value={store.prTitle}
                  onChange={(e) => actions.setPrTitle(e.target.value)}
                  placeholder="Leave empty to generate"
                  size="1"
                  disabled={store.isGeneratingPr}
                  autoFocus={
                    !store.createPrNeedsBranch && !store.createPrNeedsCommit
                  }
                />
              </Flex>

              <Flex direction="column" gap="1">
                <Text size="1" color="gray">
                  Description
                </Text>
                <TextArea
                  value={store.prBody}
                  onChange={(e) => actions.setPrBody(e.target.value)}
                  placeholder="Leave empty to generate"
                  size="1"
                  rows={4}
                  disabled={store.isGeneratingPr}
                />
              </Flex>

              <Text as="label" size="1" color="gray">
                <Flex gap="2" align="center">
                  <Checkbox
                    size="1"
                    checked={store.createPrDraft}
                    onCheckedChange={(checked) =>
                      actions.setCreatePrDraft(checked === true)
                    }
                  />
                  Create as draft
                </Flex>
              </Text>

              {store.createPrError && (
                <ErrorContainer error={store.createPrError} />
              )}

              <Flex gap="2" justify="end">
                <Dialog.Close>
                  <Button size="1" variant="soft" color="gray">
                    Cancel
                  </Button>
                </Dialog.Close>
                <Button
                  size="1"
                  disabled={isSubmitting}
                  loading={isSubmitting}
                  onClick={onSubmit}
                >
                  Create PR
                </Button>
              </Flex>
            </>
          )}

          {isExecuting && (
            <>
              <StepIndicator
                steps={steps}
                currentStep={step}
                failedStep={store.createPrFailedStep}
              />

              {step === "error" && store.createPrError && (
                <ErrorContainer
                  error={store.createPrError}
                  onFixWithAgent={
                    canFixWithAgent
                      ? () => {
                          fixWithAgent(store.createPrError ?? "");
                          actions.closeCreatePr();
                        }
                      : undefined
                  }
                />
              )}

              <Flex gap="2" justify="end">
                <Dialog.Close>
                  <Button size="1" variant="soft" color="gray">
                    {step === "error" ? "Close" : "Cancel"}
                  </Button>
                </Dialog.Close>
                {step === "error" && (
                  <Button size="1" onClick={onSubmit}>
                    Retry
                  </Button>
                )}
              </Flex>
            </>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
