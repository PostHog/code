import { TourHighlight } from "@components/TourHighlight";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { BranchSelector } from "@features/git-interaction/components/BranchSelector";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { ModeIndicatorInput } from "@features/message-editor/components/ModeIndicatorInput";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import {
  cycleModeOption,
  getCurrentModeFromConfigOptions,
} from "@features/sessions/stores/sessionStore";
import { TaskInputEditor } from "@features/task-detail/components/TaskInputEditor";
import { WorkspaceModeSelect } from "@features/task-detail/components/WorkspaceModeSelect";
import { usePreviewConfig } from "@features/task-detail/hooks/usePreviewConfig";
import { useTaskCreation } from "@features/task-detail/hooks/useTaskCreation";
import {
  useGithubBranches,
  useRepositoryIntegration,
} from "@hooks/useIntegrations";
import { ArrowLeft } from "@phosphor-icons/react";
import { Button, Flex } from "@radix-ui/themes";
import { motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useTutorialTour } from "../hooks/useTutorialTour";
import { TutorialHedgehog } from "./TutorialHedgehog";

const DOT_FILL = "var(--gray-6)";

const HEDGEHOG_MESSAGES: Record<string, string> = {
  "select-repo":
    "Pick a repo to get started — I'll help you set up PostHog instrumentation for it!",
  "select-worktree":
    "Great choice! Now pick Worktree from the workspace mode dropdown — it creates a copy of your project to work in parallel.",
  "select-model":
    "Now pick your AI model — try selecting Claude Opus 4.7 for the most capable option!",
  "explain-mode":
    "Press Shift+Tab to cycle through execution modes like Plan, Code, and more.",
  "auto-fill-prompt":
    "I've written your first task prompt — it'll set up PostHog based on the signals you enabled. Press Next when you're ready!",
  "submit-task":
    "You're ready! Hit the arrow button to launch your first task.",
  navigating: "Launching your task...",
};

const TOTAL_TOUR_STEPS = Object.keys(HEDGEHOG_MESSAGES).length - 1; // exclude "navigating"

interface TutorialStepProps {
  onComplete: () => void;
  onBack: () => void;
}

export function TutorialStep({ onComplete, onBack }: TutorialStepProps) {
  const completeOnboarding = useOnboardingStore(
    (state) => state.completeOnboarding,
  );

  // Tour state machine
  const {
    subStep,
    advance,
    isEnabled,
    isHighlighted,
    generatedPrompt,
    hasNextButton,
  } = useTutorialTour();

  const editorRef = useRef<MessageEditorHandle>(null);

  // Clear any leftover draft and delay content until the hedgehog has animated in
  const [contentVisible, setContentVisible] = useState(false);
  useLayoutEffect(() => {
    useDraftStore.getState().actions.setDraft("tutorial-input", null);
    const timer = setTimeout(() => setContentVisible(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  // GitHub repos
  const { repositories, getIntegrationIdForRepo, isLoadingRepos } =
    useRepositoryIntegration();
  const [selectedRepository, setSelectedRepository] = useState<string | null>(
    null,
  );
  const [selectedDirectory, setSelectedDirectory] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const [workspaceMode, setWorkspaceMode] = useState<
    "local" | "worktree" | "cloud"
  >("local");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const selectedIntegrationId = selectedRepository
    ? getIntegrationIdForRepo(selectedRepository)
    : undefined;

  const {
    data: cloudBranchData,
    isPending: cloudBranchesLoading,
    isFetchingMore: cloudBranchesFetchingMore,
    pauseLoadingMore: pauseCloudBranchesLoading,
    resumeLoadingMore: resumeCloudBranchesLoading,
  } = useGithubBranches(selectedIntegrationId, selectedRepository);
  const cloudBranches = cloudBranchData?.branches;
  const cloudDefaultBranch = cloudBranchData?.defaultBranch ?? null;

  // Preview config options — always claude
  const {
    modeOption,
    modelOption,
    thoughtOption,
    isLoading: isPreviewLoading,
    setConfigOption,
  } = usePreviewConfig("claude");

  const currentExecutionMode =
    getCurrentModeFromConfigOptions(modeOption ? [modeOption] : undefined) ??
    "plan";
  const currentReasoningLevel =
    thoughtOption?.type === "select" ? thoughtOption.currentValue : undefined;

  // Task creation — use whatever model the user picked
  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editorRef,
    selectedDirectory,
    selectedRepository,
    githubIntegrationId: selectedIntegrationId,
    workspaceMode,
    branch: selectedBranch,
    editorIsEmpty,
    adapter: "claude",
    executionMode: currentExecutionMode,
    model: selectedModel ?? "claude-sonnet-4-6",
    reasoningLevel: currentReasoningLevel,
  });

  // Editor wrapper is interactive when user needs to interact with model selector, editor text, or submit button
  const editorInteractive =
    subStep === "select-model" ||
    subStep === "submit-task" ||
    subStep === "navigating" ||
    isCreatingTask;

  const isTourActive = subStep !== "navigating";

  // Advance tour when user selects a repo or folder
  useEffect(() => {
    if (
      subStep === "select-repo" &&
      (selectedRepository || selectedDirectory)
    ) {
      advance();
    }
  }, [subStep, selectedRepository, selectedDirectory, advance]);

  // Auto-fill prompt with typing animation — waits for user to click Next first
  const [autoFillTriggered, setAutoFillTriggered] = useState(false);
  useEffect(() => {
    if (subStep !== "auto-fill-prompt" || !editorRef.current) return;
    if (!autoFillTriggered) return;

    let index = 0;
    const interval = setInterval(() => {
      index += 4;
      editorRef.current?.setContent(generatedPrompt.slice(0, index));
      if (index >= generatedPrompt.length) {
        clearInterval(interval);
        advance();
      }
    }, 15);

    return () => clearInterval(interval);
  }, [subStep, generatedPrompt, advance, autoFillTriggered]);

  // Track mode selection; advance only when worktree is picked during select-worktree step
  const handleWorkspaceModeChange = useCallback(
    (mode: "local" | "worktree" | "cloud") => {
      setWorkspaceMode(mode);
      if (mode === "worktree" && subStep === "select-worktree") {
        advance();
      }
    },
    [subStep, advance],
  );

  // Track model selection; advance when any model is picked during select-model step
  const handleModelChange = useCallback(
    (model: string) => {
      setSelectedModel(model);
      if (subStep === "select-model") {
        advance();
      }
    },
    [subStep, advance],
  );

  // Shift+tab mode cycling (only active during explain-mode step)
  const handleCycleMode = useCallback(() => {
    const nextValue = cycleModeOption(modeOption);
    if (nextValue && modeOption) {
      setConfigOption(modeOption.id, nextValue);
    }
  }, [modeOption, setConfigOption]);

  useHotkeys(
    "shift+tab",
    (e) => {
      e.preventDefault();
      handleCycleMode();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      enabled: !!modeOption && subStep === "explain-mode",
    },
    [handleCycleMode, modeOption, subStep],
  );

  // Submit and complete onboarding
  const handleTutorialSubmit = useCallback(async () => {
    await handleSubmit();
    completeOnboarding();
  }, [handleSubmit, completeOnboarding]);

  // Handle Next button — for auto-fill step, trigger the typing animation
  const handleNextClick = useCallback(() => {
    if (subStep === "auto-fill-prompt" && !autoFillTriggered) {
      setAutoFillTriggered(true);
    } else {
      advance();
    }
  }, [subStep, autoFillTriggered, advance]);

  const stepNumber = Math.max(
    1,
    Object.keys(HEDGEHOG_MESSAGES).indexOf(subStep) + 1,
  );
  const hedgehogMessage = HEDGEHOG_MESSAGES[subStep] ?? "";

  return (
    <Flex
      direction="column"
      flexGrow="1"
      style={{ position: "relative", minHeight: 0 }}
    >
      {/* Main content area — mirrors TaskInput layout */}
      <Flex
        align="center"
        justify="center"
        flexGrow="1"
        style={{ position: "relative" }}
      >
        {/* Dot pattern background */}
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100.333%",
            pointerEvents: "none",
            opacity: 0.4,
            maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, transparent 100%)",
          }}
        >
          <defs>
            <pattern
              id="tutorial-dot-pattern"
              patternUnits="userSpaceOnUse"
              width="8"
              height="8"
            >
              <circle cx="0" cy="0" r="1" fill={DOT_FILL} />
              <circle cx="0" cy="8" r="1" fill={DOT_FILL} />
              <circle cx="8" cy="8" r="1" fill={DOT_FILL} />
              <circle cx="8" cy="0" r="1" fill={DOT_FILL} />
              <circle cx="4" cy="4" r="1" fill={DOT_FILL} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#tutorial-dot-pattern)" />
        </svg>

        {contentVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-4)",
              fontFamily: "monospace",
              width: "100%",
              maxWidth: "600px",
              position: "relative",
            }}
          >
            {/* Row 1: Repo picker + Workspace mode + Branch */}
            <Flex
              gap="2"
              align="center"
              style={{ minWidth: 0, overflow: "visible" }}
            >
              <TourHighlight
                active={isHighlighted("repo-picker")}
                dimWhenInactive={isTourActive}
              >
                {workspaceMode === "cloud" ? (
                  <GitHubRepoPicker
                    value={selectedRepository}
                    onChange={setSelectedRepository}
                    repositories={repositories}
                    isLoading={isLoadingRepos}
                    placeholder="Select repository..."
                    size="1"
                    disabled={!isEnabled("repo-picker") || isCreatingTask}
                  />
                ) : (
                  <FolderPicker
                    value={selectedDirectory}
                    onChange={setSelectedDirectory}
                    placeholder="Select repository..."
                    size="1"
                  />
                )}
              </TourHighlight>

              <TourHighlight
                active={isHighlighted("workspace-mode")}
                dimWhenInactive={isTourActive}
              >
                <WorkspaceModeSelect
                  value={workspaceMode}
                  onChange={handleWorkspaceModeChange}
                  size="1"
                  disabled={!isEnabled("workspace-mode") || isCreatingTask}
                />
              </TourHighlight>

              <TourHighlight active={false} dimWhenInactive={isTourActive}>
                <BranchSelector
                  repoPath={
                    workspaceMode === "cloud"
                      ? selectedRepository
                      : selectedDirectory
                  }
                  currentBranch={null}
                  defaultBranch={cloudDefaultBranch}
                  disabled={!isEnabled("branch-selector") || isCreatingTask}
                  loading={cloudBranchesLoading}
                  workspaceMode={workspaceMode}
                  selectedBranch={selectedBranch}
                  onBranchSelect={setSelectedBranch}
                  cloudBranches={cloudBranches}
                  cloudBranchesLoading={cloudBranchesLoading}
                  cloudBranchesFetchingMore={cloudBranchesFetchingMore}
                  onCloudPickerOpen={resumeCloudBranchesLoading}
                  onCloudBranchCommit={pauseCloudBranchesLoading}
                />
              </TourHighlight>
            </Flex>

            {/* Row 2: Editor — opaque when a child (model/submit) is the active highlight */}
            <TourHighlight
              active={isHighlighted("editor")}
              opaque={
                isHighlighted("model-selector") ||
                isHighlighted("submit-button")
              }
              dimWhenInactive={isTourActive}
              fullWidth
            >
              <div
                style={{
                  width: "100%",
                  pointerEvents: editorInteractive ? "auto" : "none",
                }}
              >
                <TaskInputEditor
                  ref={editorRef}
                  sessionId="tutorial-input"
                  repoPath=""
                  isCreatingTask={isCreatingTask || subStep === "navigating"}
                  canSubmit={
                    isEnabled("submit-button") && canSubmit && !isCreatingTask
                  }
                  onSubmit={handleTutorialSubmit}
                  hasDirectory={!!(selectedRepository || selectedDirectory)}
                  directoryTooltip="Select a repository first"
                  onEmptyChange={setEditorIsEmpty}
                  adapter="claude"
                  modelOption={modelOption}
                  thoughtOption={thoughtOption}
                  onConfigOptionChange={(configId, value) => {
                    setConfigOption(configId, value);
                    if (configId === modelOption?.id) {
                      handleModelChange(value);
                    }
                  }}
                  onAdapterChange={() => {}}
                  isLoading={isPreviewLoading}
                  autoFocus={false}
                  tourHighlight={
                    isHighlighted("model-selector")
                      ? "model-selector"
                      : isHighlighted("submit-button")
                        ? "submit-button"
                        : null
                  }
                />
              </div>
            </TourHighlight>

            {/* Row 3: Mode indicator */}
            <TourHighlight
              active={isHighlighted("mode-indicator")}
              dimWhenInactive={isTourActive}
              fullWidth
            >
              <div
                style={{
                  width: "100%",
                  pointerEvents: subStep === "explain-mode" ? "auto" : "none",
                }}
              >
                <ModeIndicatorInput
                  modeOption={modeOption}
                  onCycleMode={
                    subStep === "explain-mode" ? handleCycleMode : undefined
                  }
                />
              </div>
            </TourHighlight>
          </motion.div>
        )}
      </Flex>

      {/* Hedgehog guide */}
      <TutorialHedgehog
        message={hedgehogMessage}
        onNext={hasNextButton ? handleNextClick : undefined}
        stepNumber={stepNumber}
        totalSteps={TOTAL_TOUR_STEPS}
      />

      {/* Bottom controls */}
      <Flex justify="between" align="center" px="6" py="4">
        <Button size="2" variant="ghost" color="gray" onClick={onBack}>
          <ArrowLeft size={14} />
          Back
        </Button>
        <Button size="2" onClick={onComplete}>
          Skip tutorial
        </Button>
      </Flex>
    </Flex>
  );
}
