export type OnboardingStep =
  | "welcome"
  | "project-select"
  | "invite-code"
  | "github"
  | "install-cli"
  | "signals";

export const ONBOARDING_STEPS: OnboardingStep[] = [
  "welcome",
  "project-select",
  "invite-code",
  "github",
  "install-cli",
  "signals",
];
