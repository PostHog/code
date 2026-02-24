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
  const currentIndex = activeSteps.indexOf(currentStep);

  return (
    <Flex align="center" gap="2" justify="center" py="6">
      {activeSteps.map((step, index) => (
        <div
          key={step}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor:
              index <= currentIndex
                ? "var(--accent-9)"
                : "rgba(255, 255, 255, 0.3)",
            transition: "background-color 0.3s ease",
          }}
        />
      ))}
    </Flex>
  );
}
