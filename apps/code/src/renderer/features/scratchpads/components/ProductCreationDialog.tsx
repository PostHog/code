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

const ROUND_OPTIONS = [1, 2, 3, 4, 5] as const;
const MIN_ROUNDS = 1;
const MAX_ROUNDS = 5;
const DEFAULT_ROUNDS = 3;

type ProjectMode = "later" | "existing";

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
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [projectMode, setProjectMode] = useState<ProjectMode>("later");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );

  const isSubmitting = step === "submitting";

  const trimmedName = productName.trim();
  const trimmedIdea = initialIdea.trim();
  const projectChoiceValid =
    projectMode === "later" || selectedProjectId !== null;
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
      setRounds(DEFAULT_ROUNDS);
      setProjectMode("later");
      setSelectedProjectId(null);
      reset();
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setError(null);
    setStep("submitting");

    try {
      let projectId: number | undefined;
      if (projectMode === "existing") {
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
      setRounds(DEFAULT_ROUNDS);
      setProjectMode("later");
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

          <Text
            as="div"
            className="rounded-(--radius-2) border border-(--gray-5) bg-(--gray-2) px-3 py-2 text-(--gray-12) text-[13px] leading-6"
          >
            We'll ask up to{" "}
            <SegmentedControl.Root
              size="1"
              value={String(rounds)}
              onValueChange={(v) => setRounds(clampRounds(Number(v)))}
              disabled={isSubmitting}
              aria-label="Clarification rounds"
              className="!h-[20px] mx-1 inline-flex align-middle text-[12px]"
            >
              {ROUND_OPTIONS.map((n) => (
                <SegmentedControl.Item key={n} value={String(n)}>
                  {n}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>{" "}
            {rounds === 1 ? "round" : "rounds"} of clarifying questions to shape
            your product.
          </Text>

          <Flex direction="column" gap="1">
            <Text color="gray" className="text-[13px]">
              Product name
            </Text>
            <TextField.Root
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="Uber for dogs"
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
              placeholder="On-demand dog walks and rides to the vet. Owners book through a mobile app, walkers/drivers accept gigs nearby, payments and tips are handled in-app..."
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
                    <RadioGroup.Item value="later" />
                    Let's do this later
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

            {projectMode === "later" && (
              <Text color="gray" className="text-[13px]">
                We'll wire up PostHog (analytics, replay, error tracking) with
                placeholder credentials so the SDK is in place. You'll pick or
                create a real project at publish time.
              </Text>
            )}
            {projectMode === "existing" && (
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
