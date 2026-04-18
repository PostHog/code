import { FullScreenLayout } from "@components/FullScreenLayout";
import { OnboardingHogTip } from "@features/onboarding/components/OnboardingHogTip";
import { Flex, Text } from "@radix-ui/themes";
import happyHog from "@renderer/assets/images/hedgehogs/happy-hog.png";
import { OAuthControls } from "./OAuthControls";

export function AuthScreen() {
  return (
    <FullScreenLayout>
      <Flex align="center" justify="center" height="100%" px="8">
        <Flex
          direction="column"
          align="center"
          style={{
            width: "100%",
            maxWidth: 480,
            height: "100%",
            paddingTop: 24,
            paddingBottom: 40,
          }}
        >
          <Flex
            direction="column"
            justify="center"
            align="center"
            style={{ flex: 1, minHeight: 0, width: "100%" }}
          >
            <Flex
              direction="column"
              align="start"
              gap="6"
              style={{ width: "100%" }}
            >
              <Flex direction="column" gap="5" style={{ width: "100%" }}>
                <Flex direction="column" gap="3" style={{ width: "100%" }}>
                  <Flex direction="column" gap="4">
                    <Flex direction="column" gap="2">
                      <Text
                        size="6"
                        weight="bold"
                        style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                      >
                        Sign in to PostHog
                      </Text>
                      <Text size="2" style={{ color: "var(--gray-11)" }}>
                        Connect your PostHog account to continue.
                      </Text>
                    </Flex>
                    <OAuthControls />
                    <OnboardingHogTip
                      hogSrc={happyHog}
                      message="Welcome back. Let's get shipping."
                    />
                  </Flex>
                </Flex>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </FullScreenLayout>
  );
}
