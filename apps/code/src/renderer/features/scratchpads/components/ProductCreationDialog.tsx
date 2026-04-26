import { PromptInput } from "@features/message-editor/components/PromptInput";
import type { EditorHandle } from "@features/message-editor/types";
import {
  contentToXml,
  extractFilePaths,
} from "@features/message-editor/utils/content";
import { ProjectPicker } from "@features/scratchpads/components/ProjectPicker";
import { useScratchpadCreationStore } from "@features/scratchpads/stores/scratchpadCreationStore";
import { ReasoningLevelSelector } from "@features/sessions/components/ReasoningLevelSelector";
import { UnifiedModelSelector } from "@features/sessions/components/UnifiedModelSelector";
import { getSessionService } from "@features/sessions/service/service";
import { getCurrentModeFromConfigOptions } from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import { RocketIcon } from "@radix-ui/react-icons";
import {
  Button,
  Dialog,
  Flex,
  RadioGroup,
  SegmentedControl,
  Text,
  TextField,
} from "@radix-ui/themes";
import { ScratchpadCreationSaga } from "@renderer/sagas/scratchpad/scratchpad-creation";
import type { ExecutionMode } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { useCallback, useRef, useState } from "react";
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

  const {
    lastUsedAdapter,
    setLastUsedAdapter,
    allowBypassPermissions,
    defaultInitialTaskMode,
    lastUsedInitialTaskMode,
  } = useSettingsStore();
  const adapter = lastUsedAdapter ?? "claude";

  const {
    modeOption,
    modelOption,
    thoughtOption,
    isLoading: isPreviewLoading,
    setConfigOption,
  } = usePreviewConfig(adapter);

  const editorRef = useRef<EditorHandle>(null);
  const [editorIsEmpty, setEditorIsEmpty] = useState(true);

  const [productName, setProductName] = useState("");
  const [rounds, setRounds] = useState<number>(DEFAULT_ROUNDS);
  const [projectMode, setProjectMode] = useState<ProjectMode>("later");
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    null,
  );

  const isSubmitting = step === "submitting";

  const trimmedName = productName.trim();
  const projectChoiceValid =
    projectMode === "later" || selectedProjectId !== null;
  const canSubmit =
    !isSubmitting &&
    trimmedName.length > 0 &&
    !editorIsEmpty &&
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

  const adapterDefault = adapter === "codex" ? "auto" : "plan";
  const modeFallback =
    defaultInitialTaskMode === "last_used"
      ? (lastUsedInitialTaskMode ?? adapterDefault)
      : adapterDefault;
  const currentExecutionMode =
    getCurrentModeFromConfigOptions(modeOption ? [modeOption] : undefined) ??
    modeFallback;
  const currentModel =
    modelOption?.type === "select" ? modelOption.currentValue : undefined;
  const currentReasoningLevel =
    thoughtOption?.type === "select" ? thoughtOption.currentValue : undefined;

  const resetForm = () => {
    editorRef.current?.clear();
    setProductName("");
    setRounds(DEFAULT_ROUNDS);
    setProjectMode("later");
    setSelectedProjectId(null);
    setEditorIsEmpty(true);
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
      const editor = editorRef.current;
      if (!editor) throw new Error("Editor unavailable");

      const content = editor.getContent();
      const initialIdea = contentToXml(content).trim();
      if (!initialIdea) throw new Error("Tell me what to build");
      const filePaths = extractFilePaths(content);

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
        initialIdea,
        rounds: clampRounds(rounds),
        adapter,
        executionMode: currentExecutionMode as ExecutionMode | undefined,
        ...(currentModel ? { model: currentModel } : {}),
        ...(currentReasoningLevel
          ? { reasoningLevel: currentReasoningLevel }
          : {}),
        ...(filePaths.length > 0 ? { filePaths } : {}),
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

      // Prime the tasks-list cache so the sidebar shows the new task
      // immediately.
      invalidateTasks(result.data.task);

      closeDialog();
      reset();
      resetForm();

      void navigateToTask(result.data.task);

      void getSessionService()
        .connectToTask({
          task: result.data.task,
          repoPath: result.data.scratchpadPath,
          initialPrompt: result.data.initialPrompt,
          adapter,
          executionMode: currentExecutionMode as ExecutionMode | undefined,
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
      <Dialog.Content maxWidth="640px" size="2">
        <Flex
          direction="column"
          gap="3"
          className="transition-all duration-200"
        >
          <Dialog.Title size="4" className="m-0">
            <Flex align="center" gap="2">
              <RocketIcon className="text-(--accent-11)" />
              Create a new product
            </Flex>
          </Dialog.Title>

          <Text
            as="div"
            className="rounded-(--radius-2) border border-(--accent-5) bg-(--accent-2) px-3 py-2 text-(--accent-12) text-[13px] leading-6"
          >
            I'll ask up to{" "}
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
            {rounds === 1 ? "round" : "rounds"} of questions before scaffolding.
          </Text>

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
            <PromptInput
              ref={editorRef}
              sessionId="product-creation-dialog"
              placeholder="Web app to get a dog delivered on demand, or something."
              disabled={isSubmitting}
              isLoading={isSubmitting}
              clearOnSubmit={false}
              submitDisabledExternal={!canSubmit}
              modeOption={modeOption}
              onModeChange={handleModeChange}
              allowBypassPermissions={allowBypassPermissions}
              enableCommands
              enableBashMode={false}
              modelSelector={
                <UnifiedModelSelector
                  modelOption={modelOption}
                  adapter={adapter}
                  onAdapterChange={setLastUsedAdapter}
                  disabled={isSubmitting}
                  isConnecting={isPreviewLoading}
                  onModelChange={handleModelChange}
                />
              }
              reasoningSelector={
                !isPreviewLoading && (
                  <ReasoningLevelSelector
                    thoughtOption={thoughtOption}
                    adapter={adapter}
                    onChange={handleThoughtChange}
                    disabled={isSubmitting}
                  />
                )
              }
              onEmptyChange={setEditorIsEmpty}
              onSubmitClick={handleSubmit}
              onSubmit={() => {
                if (canSubmit) handleSubmit();
              }}
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
              <RocketIcon />
              Start building
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
