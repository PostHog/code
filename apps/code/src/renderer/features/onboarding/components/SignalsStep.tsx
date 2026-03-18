import { DataSourceSetup } from "@features/inbox/components/DataSourceSetup";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark-alt.png";
import { motion } from "framer-motion";

interface SignalsStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function SignalsStep({ onNext, onBack }: SignalsStepProps) {
  const {
    displayValues,
    sourceStates,
    setupSource,
    isLoading,
    handleChange,
    handleSetup,
    handleSetupComplete,
    handleSetupCancel,
  } = useSignalSourceManager();

  const anyEnabled =
    displayValues.session_replay ||
    displayValues.llm_analytics ||
    displayValues.github ||
    displayValues.linear ||
    displayValues.zendesk;

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
          src={phWordmark}
          alt="PostHog"
          style={{
            height: "40px",
            objectFit: "contain",
            alignSelf: "flex-start",
          }}
        />

        <Flex
          direction="column"
          justify="center"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex direction="column" gap="6">
            <Flex direction="column" gap="3">
              <Text
                size="6"
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
                onChange={(v) => void handleChange(v)}
                disabled={isLoading}
                sourceStates={sourceStates}
                onSetup={handleSetup}
              />
            )}
          </Flex>
        </Flex>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <Flex gap="3" align="center" flexShrink="0">
            <Button
              size="3"
              variant="ghost"
              onClick={onBack}
              disabled={isLoading}
              style={{ color: "var(--gray-12)" }}
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            {anyEnabled ? (
              <Button size="3" onClick={onNext} disabled={isLoading}>
                <ArrowRight size={16} />
                Continue
              </Button>
            ) : (
              <Button
                size="3"
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
  );
}
