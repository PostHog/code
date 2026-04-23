import { OnboardingHogTip } from "@features/onboarding/components/OnboardingHogTip";
import { Flex, Text } from "@radix-ui/themes";
import { OAuthControls } from "./OAuthControls";

interface SignInCardProps {
  hogSrc: string;
  hogMessage: string;
  subtitle: string;
}

export function SignInCard({ hogSrc, hogMessage, subtitle }: SignInCardProps) {
  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="2">
        <Text
          size="6"
          weight="bold"
          style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
        >
          Sign in / sign up with PostHog
        </Text>
        <Text size="2" style={{ color: "var(--gray-11)" }}>
          {subtitle}
        </Text>
      </Flex>
      <OAuthControls />
      <OnboardingHogTip hogSrc={hogSrc} message={hogMessage} />
    </Flex>
  );
}
