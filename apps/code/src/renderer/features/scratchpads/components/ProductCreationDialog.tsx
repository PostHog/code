import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { ModeSelector } from "@features/message-editor/components/ModeSelector";
import { ProjectPicker } from "@features/scratchpads/components/ProjectPicker";
import { useScratchpadCreationStore } from "@features/scratchpads/stores/scratchpadCreationStore";
import { ReasoningLevelSelector } from "@features/sessions/components/ReasoningLevelSelector";
import { UnifiedModelSelector } from "@features/sessions/components/UnifiedModelSelector";
import { getSessionService } from "@features/sessions/service/service";
import { getCurrentModeFromConfigOptions } from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import { Sparkle } from "@phosphor-icons/react";
import { RocketIcon } from "@radix-ui/react-icons";
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
import type { ExecutionMode } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePreviewConfig } from "../../task-detail/hooks/usePreviewConfig";

const log = logger.scope("product-creation-dialog");

const MIN_ROUNDS = 1;
const MAX_ROUNDS = 4;
const ROUND_OPTIONS: number[] = Array.from(
  { length: MAX_ROUNDS },
  (_, i) => i + 1,
);
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
  const { invalidateTasks } = useCreateTask();

  const { lastUsedAdapter, setLastUsedAdapter, allowBypassPermissions } =
    useSettingsStore();
  const adapter = lastUsedAdapter ?? "claude";

  const {
    modeOption,
    modelOption,
    thoughtOption,
    isLoading: isPreviewLoading,
    setConfigOption,
  } = usePreviewConfig(adapter);

  const menuPortalRef = useRef<HTMLDivElement>(null);

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

  const handleModeChange = useCallback(
    (value: string) => {
      if (modeOption) setConfigOption(modeOption.id, value);
    },
    [modeOption, setConfigOption],
  );
  const handleModelChange = useCallback(
    (value: string) => {
      if (modelOption) setConfigOption(modelOption.id, value);
    },
    [modelOption, setConfigOption],
  );
  const handleThoughtChange = useCallback(
    (value: string) => {
      if (thoughtOption) setConfigOption(thoughtOption.id, value);
    },
    [thoughtOption, setConfigOption],
  );

  // Scratchpads always default to "auto" regardless of the user's New-task
  // mode preference — the agent is doing scaffolding from scratch and needs
  // to run things without per-step approval.
  const SCRATCHPAD_DEFAULT_MODE: ExecutionMode = "auto";
  const currentExecutionMode: ExecutionMode =
    getCurrentModeFromConfigOptions(modeOption ? [modeOption] : undefined) ??
    SCRATCHPAD_DEFAULT_MODE;

  // Force the mode option's value to "auto" once per dialog open. The
  // preview-config hook seeds modeOption.currentValue from the user's
  // saved preference; we override that here so the dialog always starts
  // in "auto", but the user can still pick something else from the
  // selector after the override has fired.
  const initialModeApplied = useRef(false);
  useEffect(() => {
    if (!open) {
      initialModeApplied.current = false;
      return;
    }
    if (initialModeApplied.current) return;
    if (!modeOption || modeOption.type !== "select") return;
    initialModeApplied.current = true;
    if (modeOption.currentValue !== SCRATCHPAD_DEFAULT_MODE) {
      setConfigOption(modeOption.id, SCRATCHPAD_DEFAULT_MODE);
    }
  }, [open, modeOption, setConfigOption]);
  const currentModel =
    modelOption?.type === "select" ? modelOption.currentValue : undefined;
  const currentReasoningLevel =
    thoughtOption?.type === "select" ? thoughtOption.currentValue : undefined;

  const resetForm = () => {
    setProductName("");
    setInitialIdea("");
    setRounds(DEFAULT_ROUNDS);
    setProjectMode("later");
    setSelectedProjectId(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (isSubmitting) return;
      closeDialog();
      resetForm();
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

      const saga = new ScratchpadCreationSaga({ posthogClient });

      const result = await saga.run({
        productName: trimmedName,
        initialIdea: trimmedIdea,
        rounds: clampRounds(rounds),
        adapter,
        executionMode: currentExecutionMode,
        ...(currentModel ? { model: currentModel } : {}),
        ...(currentReasoningLevel
          ? { reasoningLevel: currentReasoningLevel }
          : {}),
        ...(projectId !== undefined ? { projectId } : {}),
      });

      if (!result.success) {
        log.error("Scratchpad creation failed", {
          failedStep: result.failedStep,
          error: result.error,
        });
        setError(result.error ?? "Failed to create app");
        setStep("idle");
        return;
      }

      // Prime the tasks-list cache so the sidebar shows the new task
      // immediately, then navigate while the dialog is still open as a
      // loading curtain — closing first reveals the empty TaskInput
      // underneath for a frame before navigation lands on task-detail.
      invalidateTasks(result.data.task);
      await navigateToTask(result.data.task);

      void getSessionService()
        .connectToTask({
          task: result.data.task,
          repoPath: result.data.scratchpadPath,
          initialPrompt: result.data.initialPrompt,
          adapter,
          executionMode: currentExecutionMode,
          ...(currentModel ? { model: currentModel } : {}),
          ...(currentReasoningLevel
            ? { reasoningLevel: currentReasoningLevel }
            : {}),
        })
        .catch((err) => {
          log.error("Agent session failed to connect after scaffold", { err });
          toast.error("Couldn't start the agent", {
            description:
              err instanceof Error ? err.message : "Unknown connection error.",
          });
        });

      closeDialog();
      reset();
      resetForm();
    } catch (error) {
      log.error("Scratchpad creation threw", { error });
      const message =
        error instanceof Error ? error.message : "Failed to create app";
      setError(message);
      setStep("idle");
    }
  };

  if (isSubmitting) {
    return (
      <Dialog.Root open={open} onOpenChange={() => {}}>
        <Dialog.Content maxWidth="560px" size="2">
          <Dialog.Title size="4" className="m-0">
            <Flex align="center" gap="2">
              <RocketIcon className="text-(--accent-11)" />
              Preparing your app
            </Flex>
          </Dialog.Title>
          <PreparingMessages />
        </Dialog.Content>
      </Dialog.Root>
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Content maxWidth="560px" size="2">
        <Flex
          direction="column"
          gap="3"
          className="transition-all duration-200"
        >
          <Dialog.Title size="4" className="m-0">
            <Flex align="center" gap="2">
              <RocketIcon className="text-(--accent-11)" />
              Create a new app
            </Flex>
          </Dialog.Title>

          <Flex
            direction="column"
            gap="2"
            className="overflow-hidden rounded-(--radius-3) border border-(--accent-5) bg-gradient-to-br from-(--accent-2) to-(--accent-3) px-4 py-3 text-(--accent-12)"
          >
            <Flex align="center" gap="2">
              <Sparkle
                weight="fill"
                size={14}
                className="shrink-0 text-(--accent-11)"
              />
              <Text className="font-medium text-[13px] tracking-tight">
                Let's clarify, build, and deploy
              </Text>
            </Flex>
            <Text
              as="div"
              className="text-(--accent-12)/85 text-[12.5px] leading-relaxed"
            >
              I'll run up to{" "}
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
              {rounds === 1 ? "round" : "rounds"} of clarifying questions, then
              build it with a live preview, then help you deploy. PostHog wired
              up from the start.
            </Text>
          </Flex>

          <Flex direction="column" gap="1">
            <Text color="gray" className="text-[13px]">
              What are we calling it?
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
              What would you like me to build?
            </Text>
            <TextArea
              value={initialIdea}
              onChange={(e) => setInitialIdea(e.target.value)}
              placeholder="Web app to get a dog delivered on demand, or something."
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
                <Flex direction="column" gap="1">
                  <Text as="label" className="text-[13px]">
                    <Flex gap="2" align="center">
                      <RadioGroup.Item value="later" />
                      Set up on publish later
                    </Flex>
                  </Text>
                  {projectMode === "later" && (
                    <Text color="gray" className="pl-[26px] text-[13px]">
                      I'll add the PostHog SDK with placeholders. You'll pick or
                      create a PostHog project at publish time.
                    </Text>
                  )}
                </Flex>
                <Flex direction="column" gap="1">
                  <Text as="label" className="text-[13px]">
                    <Flex gap="2" align="center">
                      <RadioGroup.Item value="existing" />
                      Use existing project
                    </Flex>
                  </Text>
                  {projectMode === "existing" && (
                    <div className="pl-[26px]">
                      <ProjectPicker
                        value={selectedProjectId}
                        onChange={setSelectedProjectId}
                        disabled={isSubmitting}
                      />
                    </div>
                  )}
                </Flex>
              </Flex>
            </RadioGroup.Root>
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

          <Flex
            wrap="wrap"
            align="center"
            justify="end"
            gap="2"
            aria-label="Mode and model"
          >
            <ModeSelector
              modeOption={modeOption}
              onChange={handleModeChange}
              allowBypassPermissions={allowBypassPermissions}
              disabled={isSubmitting}
              portalContainer={menuPortalRef}
            />
            <UnifiedModelSelector
              modelOption={modelOption}
              adapter={adapter}
              onAdapterChange={setLastUsedAdapter}
              disabled={isSubmitting}
              isConnecting={isPreviewLoading}
              onModelChange={handleModelChange}
              portalContainer={menuPortalRef}
            />
            {!isPreviewLoading && (
              <ReasoningLevelSelector
                thoughtOption={thoughtOption}
                adapter={adapter}
                onChange={handleThoughtChange}
                disabled={isSubmitting}
                portalContainer={menuPortalRef}
              />
            )}
          </Flex>

          <Flex gap="2" justify="end" align="center">
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
              <RocketIcon />
              Start building
            </Button>
          </Flex>
        </Flex>
        <div ref={menuPortalRef} />
      </Dialog.Content>
    </Dialog.Root>
  );
}

function clampRounds(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_ROUNDS;
  if (value < MIN_ROUNDS) return MIN_ROUNDS;
  if (value > MAX_ROUNDS) return MAX_ROUNDS;
  return Math.floor(value);
}

const PREPARING_MESSAGES = [
  "Convincing the silicon to think...",
  "Negotiating with git...",
  "Bribing the file system...",
  "Reticulating splines...",
  "Whispering sweet nothings to electrons...",
  "Asking the cloud nicely...",
  "Brewing your scratchpad...",
  "Summoning the agent from the ether...",
  "Translating English into intent...",
  "Untangling some yarn...",
  "Polishing the bits...",
  "Pretending to be a 10x engineer...",
  "Putting the laundry in the dryer...",
  "Looking for the semicolons...",
  "Adopting a stray feature flag...",
];

function PreparingMessages() {
  const [index, setIndex] = useState(() =>
    Math.floor(Math.random() * PREPARING_MESSAGES.length),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % PREPARING_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      className="min-h-[180px] py-6"
    >
      <DotsCircleSpinner size={24} className="text-(--accent-11)" />
      <Text className="text-(--gray-12) text-[13px]" aria-live="polite">
        {PREPARING_MESSAGES[index]}
      </Text>
    </Flex>
  );
}
