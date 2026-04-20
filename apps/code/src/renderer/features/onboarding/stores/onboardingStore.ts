import { logger } from "@utils/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnboardingStep } from "../types";

const log = logger.scope("onboarding-store");

interface OnboardingStoreState {
  currentStep: OnboardingStep;
  hasCompletedOnboarding: boolean;
  hasCompletedSetup: boolean;
  isConnectingGithub: boolean;
  selectedProjectId: number | null;
  selectedDirectory: string;
}

interface OnboardingStoreActions {
  setCurrentStep: (step: OnboardingStep) => void;
  completeOnboarding: () => void;
  completeSetup: () => void;
  resetOnboarding: () => void;
  resetSelections: () => void;
  setConnectingGithub: (isConnecting: boolean) => void;
  selectProjectId: (projectId: number | null) => void;
  setSelectedDirectory: (path: string) => void;
}

type OnboardingStore = OnboardingStoreState & OnboardingStoreActions;

const initialState: OnboardingStoreState = {
  currentStep: "welcome",
  hasCompletedOnboarding: false,
  hasCompletedSetup: false,
  isConnectingGithub: false,
  selectedProjectId: null,
  selectedDirectory: "",
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentStep: (step) => set({ currentStep: step }),
      completeOnboarding: () => {
        log.info("completeOnboarding");
        set({ hasCompletedOnboarding: true });
      },
      completeSetup: () => set({ hasCompletedSetup: true }),
      resetOnboarding: () => set({ ...initialState }),
      resetSelections: () =>
        set({
          currentStep: "welcome",
          isConnectingGithub: false,
          selectedProjectId: null,
        }),
      setConnectingGithub: (isConnectingGithub) => set({ isConnectingGithub }),
      selectProjectId: (selectedProjectId) => set({ selectedProjectId }),
      setSelectedDirectory: (selectedDirectory) => set({ selectedDirectory }),
    }),
    {
      name: "onboarding-store",
      partialize: (state) => ({
        currentStep: state.currentStep,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasCompletedSetup: state.hasCompletedSetup,
        selectedProjectId: state.selectedProjectId,
        selectedDirectory: state.selectedDirectory,
      }),
    },
  ),
);
