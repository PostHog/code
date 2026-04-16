import { DataSourceSetup } from "@features/inbox/components/DataSourceSetup";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { useMeQuery } from "@hooks/useMeQuery";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";

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
    evaluations,
    evaluationsUrl,
    handleToggleEvaluation,
  } = useSignalSourceManager();
  const { data: me } = useMeQuery();
  const isStaff = me?.is_staff ?? false;

  const anyEnabled =
    displayValues.session_replay ||
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
        style={{
          width: "100%",
          maxWidth: 520,
          height: "100%",
          paddingTop: 80,
          paddingBottom: 40,
        }}
      >
        <img
          src={codeLogo}
          alt="PostHog"
          style={{
            height: "24px",
            objectFit: "contain",
            alignSelf: "flex-start",
          }}
        />

        <Flex
          direction="column"
          mt="4"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex direction="column" gap="6">
            <Flex direction="column" gap="3">
              <Text
                size="6"
                weight="bold"
                style={{
                  color: "var(--gray-12)",
                  lineHeight: 1.3,
                }}
              >
                Enable Inbox
              </Text>
              <Text size="2" style={{ color: "var(--gray-12)", opacity: 0.7 }}>
                Inbox automatically analyzes your product data and prioritizes
                actionable tasks. Choose which sources to enable for this
                project.
              </Text>
            </Flex>

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
                evaluations={isStaff ? evaluations : undefined}
                evaluationsUrl={isStaff ? evaluationsUrl : undefined}
                onToggleEvaluation={
                  isStaff
                    ? (id, enabled) => void handleToggleEvaluation(id, enabled)
                    : undefined
                }
              />
            )}
          </Flex>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.15 }}
          >
            <Flex
              gap="3"
              align="center"
              justify="between"
              flexShrink="0"
              mt="6"
            >
              <Button
                size="2"
                variant="ghost"
                onClick={onBack}
                disabled={isLoading}
                style={{ color: "var(--gray-12)" }}
              >
                <ArrowLeft size={16} />
                Back
              </Button>
              {anyEnabled ? (
                <Button
                  size="2"
                  onClick={() => void handleContinue()}
                  disabled={isLoading}
                >
                  Continue
                  <ArrowRight size={16} />
                </Button>
              ) : (
                <Button
                  size="2"
                  variant="outline"
                  onClick={onNext}
                  disabled={isLoading}
                  style={{ color: "var(--gray-12)" }}
                >
                  Skip for now
                  <ArrowRight size={16} />
                </Button>
              )}
            </Flex>
          </motion.div>
        </Flex>
      </Flex>
    </Flex>
  );
}
