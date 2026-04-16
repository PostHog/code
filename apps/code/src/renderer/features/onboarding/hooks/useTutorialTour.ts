import type { SignalSourceValues } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useCallback, useMemo, useState } from "react";
import { generateInstrumentationPrompt } from "../utils/generateInstrumentationPrompt";

export type TutorialSubStep =
  | "select-repo"
  | "select-worktree"
  | "select-model"
  | "explain-mode"
  | "auto-fill-prompt"
  | "submit-task"
  | "navigating";

type TutorialComponent =
  | "repo-picker"
  | "workspace-mode"
  | "branch-selector"
  | "editor"
  | "model-selector"
  | "mode-indicator"
  | "submit-button";

const SUB_STEP_ORDER: TutorialSubStep[] = [
  "select-repo",
  "select-worktree",
  "select-model",
  "explain-mode",
  "auto-fill-prompt",
  "submit-task",
  "navigating",
];

/**
 * The step at which each component becomes unlocked.
 * Once unlocked, it stays interactive for all subsequent steps.
 */
const UNLOCK_AT: Record<TutorialComponent, TutorialSubStep> = {
  "repo-picker": "select-repo",
  "workspace-mode": "select-worktree",
  "branch-selector": "select-worktree",
  editor: "submit-task",
  "model-selector": "select-model",
  "mode-indicator": "explain-mode",
  "submit-button": "submit-task",
};

/** Which component is highlighted (has spotlight) at each sub-step */
const HIGHLIGHTED_MAP: Record<TutorialSubStep, TutorialComponent | null> = {
  "select-repo": "repo-picker",
  "select-worktree": "workspace-mode",
  "select-model": "model-selector",
  "explain-mode": "mode-indicator",
  "auto-fill-prompt": "editor",
  "submit-task": "submit-button",
  navigating: null,
};

export function useTutorialTour() {
  const [subStep, setSubStep] = useState<TutorialSubStep>("select-repo");
  const { data: configs } = useSignalSourceConfigs();

  const signals: SignalSourceValues = useMemo(
    () => ({
      session_replay:
        configs?.some(
          (c) => c.source_product === "session_replay" && c.enabled,
        ) ?? true,
      github:
        configs?.some((c) => c.source_product === "github" && c.enabled) ??
        false,
      linear:
        configs?.some((c) => c.source_product === "linear" && c.enabled) ??
        false,
      zendesk:
        configs?.some((c) => c.source_product === "zendesk" && c.enabled) ??
        false,
      conversations:
        configs?.some(
          (c) => c.source_product === "conversations" && c.enabled,
        ) ?? false,
      error_tracking:
        configs?.some(
          (c) => c.source_product === "error_tracking" && c.enabled,
        ) ?? false,
    }),
    [configs],
  );

  const generatedPrompt = useMemo(
    () => generateInstrumentationPrompt(signals),
    [signals],
  );

  const currentIndex = SUB_STEP_ORDER.indexOf(subStep);

  const advance = useCallback(() => {
    setSubStep((current) => {
      const idx = SUB_STEP_ORDER.indexOf(current);
      if (idx < SUB_STEP_ORDER.length - 1) {
        return SUB_STEP_ORDER[idx + 1];
      }
      return current;
    });
  }, []);

  const isEnabled = useCallback(
    (component: TutorialComponent): boolean => {
      const unlockStep = UNLOCK_AT[component];
      const unlockIndex = SUB_STEP_ORDER.indexOf(unlockStep);
      return currentIndex >= unlockIndex;
    },
    [currentIndex],
  );

  const isHighlighted = useCallback(
    (component: TutorialComponent): boolean => {
      return HIGHLIGHTED_MAP[subStep] === component;
    },
    [subStep],
  );

  /** Whether the tooltip for this step has a "Next" button (vs being advanced by user action) */
  const hasNextButton =
    subStep === "explain-mode" || subStep === "auto-fill-prompt";

  return {
    subStep,
    advance,
    isEnabled,
    isHighlighted,
    generatedPrompt,
    hasNextButton,
  };
}
