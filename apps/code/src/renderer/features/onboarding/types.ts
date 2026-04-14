export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "org"
  | "github"
  | "install-cli"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "github",
  "org",
  "install-cli",
  "signals",
];
