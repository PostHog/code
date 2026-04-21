import { Flex } from "@radix-ui/themes";
import type { OnboardingStep } from "../types";

interface StepIndicatorProps {
  currentStep: OnboardingStep;
  activeSteps: OnboardingStep[];
}

export function StepIndicator({
  currentStep,
  activeSteps,
}: StepIndicatorProps) {
  const displaySteps = activeSteps;
  const currentIndex = displaySteps.indexOf(currentStep);

  return (
    <Flex align="center" gap="2" justify="center" py="6">
      {displaySteps.map((step, index) => (
        <div
          key={step}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor:
              index <= currentIndex ? "var(--accent-9)" : "var(--gray-5)",
            transition: "background-color 0.3s ease",
          }}
        />
      ))}
    </Flex>
  );
}
