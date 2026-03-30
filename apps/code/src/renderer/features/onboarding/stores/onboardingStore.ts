import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnboardingStep } from "../types";

interface OnboardingStoreState {
  currentStep: OnboardingStep;
  hasCompletedOnboarding: boolean;
  isConnectingGithub: boolean;
  selectedPlan: "free" | "pro" | null;
  selectedOrgId: string | null;
  selectedProjectId: number | null;
}

interface OnboardingStoreActions {
  setCurrentStep: (step: OnboardingStep) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
  resetSelections: () => void;
  setConnectingGithub: (isConnecting: boolean) => void;
  selectPlan: (plan: "free" | "pro") => void;
  selectOrg: (orgId: string) => void;
  selectProjectId: (projectId: number | null) => void;
}

type OnboardingStore = OnboardingStoreState & OnboardingStoreActions;

const initialState: OnboardingStoreState = {
  currentStep: "welcome",
  hasCompletedOnboarding: false,
  isConnectingGithub: false,
  selectedPlan: null,
  selectedOrgId: null,
  selectedProjectId: null,
};

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      ...initialState,

      setCurrentStep: (step) => set({ currentStep: step }),
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      resetOnboarding: () => set({ ...initialState }),
      resetSelections: () =>
        set({
          currentStep: "welcome",
          isConnectingGithub: false,
          selectedPlan: null,
          selectedOrgId: null,
          selectedProjectId: null,
        }),
      setConnectingGithub: (isConnectingGithub) => set({ isConnectingGithub }),
      selectPlan: (plan) => set({ selectedPlan: plan }),
      selectOrg: (orgId) => set({ selectedOrgId: orgId }),
      selectProjectId: (selectedProjectId) => set({ selectedProjectId }),
    }),
    {
      name: "onboarding-store",
      partialize: (state) => ({
        currentStep: state.currentStep,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        selectedPlan: state.selectedPlan,
        selectedOrgId: state.selectedOrgId,
        selectedProjectId: state.selectedProjectId,
      }),
    },
  ),
);
