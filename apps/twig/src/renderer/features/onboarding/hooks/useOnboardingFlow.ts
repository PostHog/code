import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useMemo, useState } from "react";
import { ONBOARDING_STEPS, type OnboardingStep } from "../types";

export function useOnboardingFlow() {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const billingEnabled = useFeatureFlag("twig-billing", true);

  // Filter steps based on feature flags
  const activeSteps = useMemo(() => {
    if (billingEnabled) {
      return ONBOARDING_STEPS;
    }
    // Skip billing and org-billing steps if flag is disabled
    return ONBOARDING_STEPS.filter(
      (step) => step !== "billing" && step !== "org-billing",
    );
  }, [billingEnabled]);

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
