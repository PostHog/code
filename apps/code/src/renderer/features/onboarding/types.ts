export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "context-collection"
  | "org"
  | "github"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "github",
  "org",
  "signals",
  "context-collection",
];
