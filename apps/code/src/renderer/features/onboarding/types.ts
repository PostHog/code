export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "github"
  | "install-cli"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "github",
  "install-cli",
  "signals",
];
