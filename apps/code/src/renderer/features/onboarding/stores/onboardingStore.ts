import { logger } from "@utils/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnboardingStep } from "../types";

const log = logger.scope("onboarding-store");

interface OnboardingStoreState {
  currentStep: OnboardingStep;
  hasCompletedOnboarding: boolean;
  isConnectingGithub: boolean;
  selectedProjectId: number | null;
}

interface OnboardingStoreActions {
  setCurrentStep: (step: OnboardingStep) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  resetSelections: () => void;
  setConnectingGithub: (isConnecting: boolean) => void;
  selectProjectId: (projectId: number | null) => void;
}

type OnboardingStore = OnboardingStoreState & OnboardingStoreActions;

const initialState: OnboardingStoreState = {
  currentStep: "welcome",
  hasCompletedOnboarding: false,
  isConnectingGithub: false,
  selectedProjectId: null,
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
      resetOnboarding: () => set({ ...initialState }),
      resetSelections: () =>
        set({
          currentStep: "welcome",
          isConnectingGithub: false,
          selectedProjectId: null,
        }),
      setConnectingGithub: (isConnectingGithub) => set({ isConnectingGithub }),
      selectProjectId: (selectedProjectId) => set({ selectedProjectId }),
    }),
    {
      name: "onboarding-store",
      partialize: (state) => ({
        currentStep: state.currentStep,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    },
  ),
);
