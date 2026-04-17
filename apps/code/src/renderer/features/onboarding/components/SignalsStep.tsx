import { DataSourceSetup } from "@features/inbox/components/DataSourceSetup";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import detectiveHog from "@renderer/assets/images/hedgehogs/detective-hog.png";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { OnboardingHogTip } from "./OnboardingHogTip";
import { StepActions } from "./StepActions";

interface SignalsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function SignalsStep({ onNext, onBack }: SignalsStepProps) {
  const queryClient = useQueryClient();
  const {
    displayValues,
    sourceStates,
    setupSource,
    isLoading,
    handleToggle,
    handleSetup,
    handleSetupComplete,
    handleSetupCancel,
  } = useSignalSourceManager();

  const anyEnabled =
    displayValues.error_tracking ||
    displayValues.github ||
    displayValues.linear ||
    displayValues.zendesk;

  const handleContinue = async (): Promise<void> => {
    if (anyEnabled) {
      await queryClient.invalidateQueries({
        queryKey: ["inbox", "signal-reports"],
      });
    }
    onNext();
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        align="center"
        style={{
          width: "100%",
          height: "100%",
          paddingTop: 24,
          paddingBottom: 40,
        }}
      >
        <Flex
          direction="column"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            width: "100%",
            scrollbarWidth: "none",
          }}
        >
          <Flex
            direction="column"
            gap="6"
            style={{
              width: "100%",
              maxWidth: 560,
              margin: "auto auto",
              padding: "16px 0",
            }}
          >
            {/* Header + content */}
            <Flex direction="column" gap="5" style={{ width: "100%" }}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Flex direction="column" gap="3">
                  <Text
                    size="6"
                    weight="bold"
                    style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                  >
                    Teach your agents what matters
                  </Text>
                  <Text size="2" style={{ color: "var(--gray-11)" }}>
                    Signals watch your product data around the clock and surface
                    the highest-impact work straight to your Inbox.
                  </Text>
                </Flex>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                {setupSource ? (
                  <DataSourceSetup
                    source={setupSource}
                    onComplete={() => void handleSetupComplete()}
                    onCancel={handleSetupCancel}
                  />
                ) : (
                  <SignalSourceToggles
                    value={displayValues}
                    onToggle={(source, enabled) =>
                      void handleToggle(source, enabled)
                    }
                    disabled={isLoading}
                    sourceStates={sourceStates}
                    onSetup={handleSetup}
                  />
                )}
              </motion.div>
            </Flex>

            {/* Hog tip */}
            <OnboardingHogTip
              hogSrc={detectiveHog}
              message="I'll investigate these sources around the clock and deliver tasks straight to your inbox when I find something worth acting on."
              delay={0.2}
            />
          </Flex>
        </Flex>

        <StepActions delay={0.25}>
          <Button
            size="3"
            variant="outline"
            color="gray"
            onClick={onBack}
            disabled={isLoading}
          >
            <ArrowLeft size={16} weight="bold" />
            Back
          </Button>
          {anyEnabled ? (
            <Button
              size="3"
              onClick={() => void handleContinue()}
              disabled={isLoading}
            >
              Continue
              <ArrowRight size={16} weight="bold" />
            </Button>
          ) : (
            <Button
              size="3"
              variant="outline"
              color="gray"
              onClick={onNext}
              disabled={isLoading}
            >
              Skip for now
              <ArrowRight size={16} weight="bold" />
            </Button>
          )}
        </StepActions>
      </Flex>
    </Flex>
  );
}
