import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { ONBOARDING_STEPS, type OnboardingStep } from "../types";

export function useOnboardingFlow() {
  const currentStep = useOnboardingStore((state) => state.currentStep);
  const setCurrentStep = useOnboardingStore((state) => state.setCurrentStep);

  const activeSteps = ONBOARDING_STEPS;

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
