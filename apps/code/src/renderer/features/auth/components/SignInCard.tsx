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
        <Text className="font-bold text-(--gray-12) text-2xl">
          Sign in / sign up with PostHog
        </Text>
        <Text className="text-(--gray-11) text-sm">{subtitle}</Text>
      </Flex>
      <OAuthControls />
      <OnboardingHogTip hogSrc={hogSrc} message={hogMessage} />
    </Flex>
  );
}
