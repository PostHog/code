import { ProjectPicker } from "@features/scratchpads/components/ProjectPicker";
import { useScratchpadCreationStore } from "@features/scratchpads/stores/scratchpadCreationStore";
import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import {
  Button,
  Dialog,
  Flex,
  RadioGroup,
  SegmentedControl,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { ScratchpadCreationSaga } from "@renderer/sagas/scratchpad/scratchpad-creation";
import { useNavigationStore } from "@stores/navigationStore";
import { logger } from "@utils/logger";
import { useState } from "react";

const log = logger.scope("product-creation-dialog");

const ROUND_OPTIONS = [3, 4, 5] as const;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 5;

type ProjectMode = "auto" | "existing";

export function ProductCreationDialog() {
  const open = useScratchpadCreationStore((s) => s.open);
  const step = useScratchpadCreationStore((s) => s.step);
  const lastError = useScratchpadCreationStore((s) => s.lastError);
  const closeDialog = useScratchpadCreationStore((s) => s.closeDialog);
  const setStep = useScratchpadCreationStore((s) => s.setStep);
  const setError = useScratchpadCreationStore((s) => s.setError);
  const reset = useScratchpadCreationStore((s) => s.reset);

  const posthogClient = useAuthenticatedClient();
  const navigateToTask = useNavigationStore((s) => s.navigateToTask);

  const [productName, setProductName] = useState("");
  const [initialIdea, setInitialIdea] = useState("");
  const [rounds, setRounds] = useState<number>(3);
  const [projectMode, setProjectMode] = useState<ProjectMode>("auto");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );

  const isSubmitting = step === "submitting";

  const trimmedName = productName.trim();
  const trimmedIdea = initialIdea.trim();
  const projectChoiceValid =
    projectMode === "auto" || selectedProjectId !== null;
  const canSubmit =
    !isSubmitting &&
    trimmedName.length > 0 &&
    trimmedIdea.length > 0 &&
    projectChoiceValid;

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (isSubmitting) return;
      closeDialog();
      // Reset form state for next time the user opens.
      setProductName("");
      setInitialIdea("");
      setRounds(3);
      setProjectMode("auto");
      setSelectedProjectId(null);
      reset();
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError(null);
    setStep("submitting");

    try {
      let autoCreate: { organizationId: string } | undefined;
      let projectId: number | undefined;

      if (projectMode === "auto") {
        const user = await posthogClient.getCurrentUser();
        const organizationId = (
          user as { organization?: { id?: string } | null }
        ).organization?.id;
        if (!organizationId) {
          throw new Error(
            "Cannot auto-create project: current user has no organization",
          );
        }
        autoCreate = { organizationId };
      } else {
        if (selectedProjectId === null) {
          throw new Error("Please pick a PostHog project");
        }
        projectId = selectedProjectId;
      }

      const saga = new ScratchpadCreationSaga({
        posthogClient,
        onTaskReady: ({ task }) => {
          // Navigate as soon as the workspace is ready, before the agent
          // session connects, for snappier UX. We don't await here.
          void navigateToTask(task);
        },
      });

      const result = await saga.run({
        productName: trimmedName,
        initialIdea: trimmedIdea,
        rounds: clampRounds(rounds),
        ...(autoCreate ? { autoCreateProject: autoCreate } : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      });

      if (!result.success) {
        log.error("Scratchpad creation failed", {
          failedStep: result.failedStep,
          error: result.error,
        });
        setError(result.error ?? "Failed to create product");
        setStep("idle");
        return;
      }

      // Success — close + reset.
      closeDialog();
      reset();
      setProductName("");
      setInitialIdea("");
      setRounds(3);
      setProjectMode("auto");
      setSelectedProjectId(null);
    } catch (error) {
      log.error("Scratchpad creation threw", { error });
      const message =
        error instanceof Error ? error.message : "Failed to create product";
      setError(message);
      setStep("idle");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content maxWidth="520px" size="2">
        <Flex
          direction="column"
          gap="3"
          className="transition-all duration-200"
        >
          <Dialog.Title size="3" className="m-0">
            Create a new product
          </Dialog.Title>

          <Flex
            align="center"
            justify="between"
            gap="3"
            className="rounded-(--radius-2) border border-(--gray-5) bg-(--gray-2) px-3 py-2"
          >
            <Text className="text-(--gray-12) text-[13px]">
              We'll ask up to {rounds} rounds of clarifying questions to shape
              your product.
            </Text>
            <SegmentedControl.Root
              size="1"
              value={String(rounds)}
              onValueChange={(v) => setRounds(clampRounds(Number(v)))}
            >
              {ROUND_OPTIONS.map((n) => (
                <SegmentedControl.Item key={n} value={String(n)}>
                  {n}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
          </Flex>

          <Flex direction="column" gap="1">
            <Text color="gray" className="text-[13px]">
              Product name
            </Text>
            <TextField.Root
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Chess Clock"
              size="2"
              disabled={isSubmitting}
              autoFocus
            />
          </Flex>

          <Flex direction="column" gap="1">
            <Text color="gray" className="text-[13px]">
              Initial idea
            </Text>
            <TextArea
              value={initialIdea}
              onChange={(e) => setInitialIdea(e.target.value)}
              placeholder="A simple chess clock that supports increments and delays..."
              size="2"
              rows={5}
              disabled={isSubmitting}
            />
          </Flex>

          <Flex direction="column" gap="2">
            <Text color="gray" className="text-[13px]">
              PostHog project
            </Text>
            <RadioGroup.Root
              value={projectMode}
              onValueChange={(v) => setProjectMode(v as ProjectMode)}
              size="2"
              disabled={isSubmitting}
            >
              <Flex direction="column" gap="2">
                <Text as="label" className="text-[13px]">
                  <Flex gap="2" align="center">
                    <RadioGroup.Item value="auto" />
                    Auto-create new project
                  </Flex>
                </Text>
                <Text as="label" className="text-[13px]">
                  <Flex gap="2" align="center">
                    <RadioGroup.Item value="existing" />
                    Use existing project
                  </Flex>
                </Text>
              </Flex>
            </RadioGroup.Root>

            {projectMode === "auto" ? (
              <Text color="gray" className="text-[13px]">
                {trimmedName
                  ? `Will create [UNPUBLISHED] ${trimmedName} in your current organization.`
                  : "Will create a new project in your current organization."}
              </Text>
            ) : (
              <ProjectPicker
                value={selectedProjectId}
                onChange={setSelectedProjectId}
                disabled={isSubmitting}
              />
            )}
          </Flex>

          {lastError && (
            <Text
              color="red"
              className="rounded-(--radius-2) border border-(--red-5) bg-(--red-2) px-3 py-2 text-[13px]"
              role="alert"
            >
              {lastError}
            </Text>
          )}

          <Flex gap="2" justify="end">
            <Button
              size="2"
              variant="soft"
              color="gray"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              size="2"
              onClick={handleSubmit}
              disabled={!canSubmit}
              loading={isSubmitting}
            >
              Create product
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function clampRounds(value: number): number {
  if (Number.isNaN(value)) return 3;
  if (value < MIN_ROUNDS) return MIN_ROUNDS;
  if (value > MAX_ROUNDS) return MAX_ROUNDS;
  return Math.floor(value);
}
