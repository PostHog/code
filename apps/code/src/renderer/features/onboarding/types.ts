export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "work-context"
  | "context-collection"
  | "billing"
  | "org"
  | "github"
  | "signals"
  | "tutorial";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "github",
  "billing",
  "org-billing",
  "signals",
  "work-context",
  "context-collection",
  "tutorial",
];
