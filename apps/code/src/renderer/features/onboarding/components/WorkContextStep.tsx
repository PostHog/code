import { useAuthStore } from "@features/auth/stores/authStore";
import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button, Flex, Text, TextArea } from "@radix-ui/themes";
import builderHog from "@renderer/assets/images/hedgehogs/builder-hog-03.png";
import detectiveHog from "@renderer/assets/images/hedgehogs/detective-hog.png";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import featureFlagHog from "@renderer/assets/images/hedgehogs/feature-flag-hog.png";
import graphsHog from "@renderer/assets/images/hedgehogs/graphs-hog.png";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

const EXAMPLES = [
  { text: "Improving our onboarding conversion funnel", hog: graphsHog },
  { text: "Setting up feature flags for a new launch", hog: featureFlagHog },
  { text: "Debugging a spike in errors on checkout", hog: detectiveHog },
  { text: "Adding analytics to understand user behavior", hog: explorerHog },
  { text: "Migrating from Amplitude to PostHog", hog: builderHog },
];

interface WorkContextStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function WorkContextStep({ onNext, onBack }: WorkContextStepProps) {
  const { workContext, setWorkContext } = useAuthStore();
  const [value, setValue] = useState(workContext ?? "");
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setExampleIndex((i) => (i + 1) % EXAMPLES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleContinue = () => {
    if (value.trim()) {
      setWorkContext(value.trim());
    }
    onNext();
  };

  const example = EXAMPLES[exampleIndex];

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
          justify="center"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex
            direction="column"
            gap="5"
            style={{
              width: "100%",
              minWidth: 560,
              maxWidth: 560,
              margin: "0 auto",
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Flex direction="column" gap="2">
                <Text
                  size="6"
                  style={{
                    color: "var(--gray-12)",
                    lineHeight: 1.3,
                  }}
                >
                  What are you focused on right now?
                </Text>
                <Text size="2" style={{ color: "var(--gray-11)" }}>
                  This helps us prioritize what to surface first.
                </Text>
              </Flex>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
            >
              <TextArea
                size="3"
                placeholder="In a few words, describe your current goals..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus={true}
                style={{
                  minHeight: 120,
                  outline: "none",
                  boxShadow: "none",
                  width: "100%",
                  border: "1px solid var(--gray-4)",
                }}
              />
            </motion.div>

            {/* Hog with rotating speech bubble */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <Flex align="center" gap="3">
                {/* Hog image */}
                <AnimatePresence mode="wait">
                  <motion.img
                    key={exampleIndex}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.25 }}
                    src={example.hog}
                    alt=""
                    style={{
                      width: 48,
                      height: 48,
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                  />
                </AnimatePresence>

                {/* Speech bubble */}
                <div>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={exampleIndex}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.2 }}
                      style={{
                        position: "relative",
                        backgroundColor: "var(--color-panel-solid)",
                        border: "1px solid var(--gray-a4)",
                        borderRadius: "var(--radius-3)",
                        padding: "6px 12px",
                      }}
                    >
                      <Text
                        size="1"
                        style={{
                          color: "var(--gray-11)",
                          lineHeight: 1.5,
                          fontStyle: "italic",
                        }}
                      >
                        "{example.text}"
                      </Text>

                      {/* Border tail */}
                      <div
                        style={{
                          position: "absolute",
                          top: 14,
                          left: -8,
                          width: 0,
                          height: 0,
                          borderTop: "8px solid transparent",
                          borderBottom: "8px solid transparent",
                          borderRight: "8px solid var(--gray-a4)",
                        }}
                      />
                      {/* Fill tail */}
                      <div
                        style={{
                          position: "absolute",
                          top: 15,
                          left: -7,
                          width: 0,
                          height: 0,
                          borderTop: "7px solid transparent",
                          borderBottom: "7px solid transparent",
                          borderRight: "7px solid var(--color-panel-solid)",
                        }}
                      />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </Flex>
            </motion.div>
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
              style={{ color: "var(--gray-12)" }}
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button size="3" onClick={handleContinue}>
              Continue
              <ArrowRight size={16} />
            </Button>
          </Flex>
        </motion.div>
      </Flex>
    </Flex>
  );
}
