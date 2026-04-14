export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "work-context"
  | "context-collection"
  | "billing"
  | "org"
  | "github"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "github",
  "billing",
  "org",
  "signals",
  "work-context",
  "context-collection",
];
