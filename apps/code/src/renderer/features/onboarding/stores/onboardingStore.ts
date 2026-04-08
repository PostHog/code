import { useSeatStore } from "@features/billing/stores/seatStore";
import { isFeatureFlagEnabled } from "@utils/analytics";
import { logger } from "@utils/logger";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { OnboardingStep } from "../types";

const log = logger.scope("onboarding-store");

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
      completeOnboarding: () => {
        const billingEnabled = isFeatureFlagEnabled("posthog-code-billing");
        const existingSeat = useSeatStore.getState().seat;
        log.info("[seat] completeOnboarding", {
          billingEnabled,
          hasSeat: !!existingSeat,
          seatPlan: existingSeat?.plan_key ?? null,
        });
        set({ hasCompletedOnboarding: true });

        if (!billingEnabled) {
          log.info("[seat] skipped — billing flag disabled");
          return;
        }
        if (existingSeat) {
          log.info("[seat] skipped — seat already exists", {
            plan: existingSeat.plan_key,
            status: existingSeat.status,
          });
          return;
        }
        log.info("[seat] no seat found — provisioning free seat");
        useSeatStore.getState().provisionFreeSeat();
      },
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
