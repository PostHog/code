export type OnboardingStep =
  | "welcome"
  | "billing"
  | "org-billing"
  | "git-integration"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "billing",
  "org-billing",
  "git-integration",
  "signals",
];
