import { FullScreenLayout } from "@components/FullScreenLayout";
import { Flex } from "@radix-ui/themes";
import happyHog from "@renderer/assets/images/hedgehogs/happy-hog.png";
import { SignInCard } from "./SignInCard";

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
                <SignInCard
                  hogSrc={happyHog}
                  hogMessage="Welcome back. Let's get shipping."
                  subtitle="Connect your PostHog account to continue."
                />
              </Flex>
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </FullScreenLayout>
  );
}
