export type OnboardingStep =
  | "welcome"
  | "billing"
  | "org-billing"
  | "git-integration"
  | "signals"
  | "tutorial";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "billing",
  "org-billing",
  "git-integration",
  "signals",
  "tutorial",
];
