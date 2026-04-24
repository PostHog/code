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
          style={{ color: "var(--gray-12)" }}
          className="font-bold text-2xl leading-tight"
        >
          Sign in / sign up with PostHog
        </Text>
        <Text style={{ color: "var(--gray-11)" }} className="text-sm">
          {subtitle}
        </Text>
      </Flex>
      <OAuthControls />
      <OnboardingHogTip hogSrc={hogSrc} message={hogMessage} />
    </Flex>
  );
}
