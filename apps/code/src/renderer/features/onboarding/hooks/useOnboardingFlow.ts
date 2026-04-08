import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useEffect, useMemo } from "react";
import { ONBOARDING_STEPS, type OnboardingStep } from "../types";

export function useOnboardingFlow() {
  const currentStep = useOnboardingStore((state) => state.currentStep);
  const setCurrentStep = useOnboardingStore((state) => state.setCurrentStep);
  const billingEnabled = useFeatureFlag("posthog-code-billing", false);

  // Show billing onboarding steps only when billing is enabled
  const activeSteps = useMemo(() => {
    if (billingEnabled) {
      return ONBOARDING_STEPS;
    }
    return ONBOARDING_STEPS.filter(
      (step) => step !== "billing" && step !== "org-billing",
    );
  }, [billingEnabled]);

  // Reset to first step if current step is no longer in active steps
  useEffect(() => {
    if (!activeSteps.includes(currentStep)) {
      setCurrentStep(activeSteps[0]);
    }
  }, [activeSteps, currentStep, setCurrentStep]);

  const currentIndex = activeSteps.indexOf(currentStep);
  const isFirstStep = currentIndex === 0;
  const isLastStep = currentIndex === activeSteps.length - 1;

  const next = () => {
    if (!isLastStep) {
      setCurrentStep(activeSteps[currentIndex + 1]);
    }
  };

  const back = () => {
    if (!isFirstStep) {
      setCurrentStep(activeSteps[currentIndex - 1]);
    }
  };

  const goTo = (step: OnboardingStep) => {
    setCurrentStep(step);
  };

  return {
    currentStep,
    currentIndex,
    totalSteps: activeSteps.length,
    activeSteps,
    isFirstStep,
    isLastStep,
    next,
    back,
    goTo,
  };
}
