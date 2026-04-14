import { DotPatternBackground } from "@components/DotPatternBackground";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { useContextCollection } from "@features/onboarding/hooks/useContextCollection";
import { SourceFeed } from "@features/onboarding/components/context-collection/SourceFeed";
import { SuggestedTasks } from "@features/onboarding/components/context-collection/SuggestedTasks";
import { Rocket } from "@phosphor-icons/react";
import { Box, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { useNavigationStore } from "@stores/navigationStore";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export function SetupView() {
  const { sources, phase, isAllDone, totalItems } = useContextCollection();
  const [showTasks, setShowTasks] = useState(false);
  const completeSetup = useOnboardingStore((state) => state.completeSetup);
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );

  useSetHeaderContent(
    <Flex align="center" gap="2">
      <Rocket size={16} weight="duotone" />
      <Text size="2" weight="medium">
        Finish setup
      </Text>
    </Flex>,
  );

  useEffect(() => {
    if (!isAllDone) return;
    const timeout = setTimeout(() => setShowTasks(true), 800);
    return () => clearTimeout(timeout);
  }, [isAllDone]);

  const handleSelectTask = () => {
    completeSetup();
    navigateToTaskInput();
  };

  const handleSkip = () => {
    completeSetup();
    navigateToTaskInput();
  };

  return (
    <ScrollArea
      scrollbars="vertical"
      style={{ height: "100%", position: "relative" }}
    >
      <DotPatternBackground />
      <Flex
        align="center"
        justify="center"
        style={{ minHeight: "100%", padding: "48px 24px" }}
      >
        <Flex
          direction="column"
          gap="5"
          style={{
            width: "100%",
            maxWidth: 520,
            backgroundColor: "var(--color-panel-translucent)",
            borderRadius: 16,
            padding: "24px 28px",
          }}
        >
          <AnimatePresence mode="wait">
            {!showTasks ? (
              <motion.div
                key="scanning"
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
              >
                <Flex direction="column" gap="5">
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Flex direction="column" gap="2">
                      <Text
                        size="6"
                        weight="bold"
                        style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                      >
                        Building your context...
                      </Text>
                      <Text size="2" style={{ color: "var(--gray-11)" }}>
                        Scanning your data sources for insights and priorities.
                      </Text>
                    </Flex>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                  >
                    <SourceFeed sources={sources} />
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  >
                    <Flex align="center" gap="3" py="2">
                      <img
                        src={explorerHog}
                        alt=""
                        style={{
                          width: 40,
                          height: 40,
                          objectFit: "contain",
                          flexShrink: 0,
                        }}
                      />
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={phase}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Text
                            size="2"
                            style={{
                              color: isAllDone
                                ? "var(--green-11)"
                                : "var(--gray-11)",
                              fontStyle: isAllDone ? "normal" : "italic",
                            }}
                          >
                            {phase}
                            {isAllDone && (
                              <Text
                                size="2"
                                style={{
                                  color: "var(--gray-9)",
                                  marginLeft: 8,
                                }}
                              >
                                {totalItems.toLocaleString()} items across{" "}
                                {sources.length} sources
                              </Text>
                            )}
                          </Text>
                        </motion.div>
                      </AnimatePresence>
                    </Flex>
                  </motion.div>
                </Flex>
              </motion.div>
            ) : (
              <motion.div
                key="tasks"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <Flex direction="column" gap="5">
                  <Flex direction="column" gap="2">
                    <Text
                      size="6"
                      weight="bold"
                      style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                    >
                      Here's what we found
                    </Text>
                    <Text size="2" style={{ color: "var(--gray-11)" }}>
                      Based on {totalItems.toLocaleString()} items across your
                      data sources, we recommend starting with one of these:
                    </Text>
                  </Flex>

                  <SuggestedTasks onSelectTask={handleSelectTask} />

                  <Box pt="2">
                    <Button
                      size="2"
                      variant="ghost"
                      color="gray"
                      onClick={handleSkip}
                    >
                      Skip for now
                    </Button>
                  </Box>
                </Flex>
              </motion.div>
            )}
          </AnimatePresence>
        </Flex>
      </Flex>
    </ScrollArea>
  );
}
