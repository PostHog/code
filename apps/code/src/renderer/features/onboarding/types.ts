export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "org"
  | "github"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "github",
  "org",
  "signals",
];
