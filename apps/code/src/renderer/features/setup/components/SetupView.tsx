import { DotPatternBackground } from "@components/DotPatternBackground";
import { SuggestedTasks } from "@features/onboarding/components/context-collection/SuggestedTasks";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { SetupScanFeed } from "@features/setup/components/SetupScanFeed";
import { useSetupRun } from "@features/setup/hooks/useSetupRun";
import { useSetupStore } from "@features/setup/stores/setupStore";
import type { DiscoveredTask } from "@features/setup/types";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { MagicWand, Robot, Rocket } from "@phosphor-icons/react";
import { Box, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { useNavigationStore } from "@stores/navigationStore";
import { track } from "@utils/analytics";
import { motion } from "framer-motion";
import { useRef } from "react";

export function SetupView() {
  const {
    discoveryFeed,
    wizardFeed,
    isDiscoveryDone,
    isWizardStarted,
    wizardSkipped,
    discoveredTasks,
    error,
  } = useSetupRun();
  const completeSetup = useOnboardingStore((state) => state.completeSetup);
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );
  const viewTrackedRef = useRef(false);

  useSetHeaderContent(
    <Flex align="center" gap="2">
      <Rocket size={16} weight="duotone" />
      <Text size="2" weight="medium">
        Finish setup
      </Text>
    </Flex>,
  );

  if (!viewTrackedRef.current) {
    viewTrackedRef.current = true;
    track(ANALYTICS_EVENTS.SETUP_VIEWED, {
      discovery_status: useSetupStore.getState().discoveryStatus,
    });
  }

  const handleSelectTask = (task: DiscoveredTask) => {
    const position = discoveredTasks.findIndex((t) => t.id === task.id);
    track(ANALYTICS_EVENTS.SETUP_TASK_SELECTED, {
      discovered_task_id: task.id,
      category: task.category,
      position: position >= 0 ? position : 0,
      total_discovered: discoveredTasks.length,
    });
    completeSetup();
    navigateToTaskInput();
  };

  const handleSkip = () => {
    track(ANALYTICS_EVENTS.SETUP_SKIPPED, {
      discovery_status: useSetupStore.getState().discoveryStatus,
      had_discovered_tasks: discoveredTasks.length > 0,
    });
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
        style={{
          minHeight: "100%",
          padding: "48px 24px",
          position: "relative",
          zIndex: 1,
        }}
      >
        <Flex
          direction="column"
          gap="5"
          style={{
            width: "100%",
            maxWidth: 520,
            backgroundColor: "var(--color-background)",
            border: "1px solid var(--gray-a3)",
            borderRadius: 16,
            padding: "24px 28px",
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
                weight="bold"
                style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
              >
                Setting up PostHog
              </Text>
              <Text size="2" style={{ color: "var(--gray-11)" }}>
                We're configuring your integration and scanning for quick wins.
              </Text>
            </Flex>
          </motion.div>

          <Flex direction="column" gap="3">
            {isWizardStarted && !wizardSkipped && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                <SetupScanFeed
                  label="Integrating PostHog features"
                  icon={MagicWand}
                  color="blue"
                  currentTool={wizardFeed.currentTool}
                  recentEntries={wizardFeed.recentEntries}
                  isDone={false}
                  doneLabel="Integration ready"
                />
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <SetupScanFeed
                label="Searching for your first tasks"
                icon={Robot}
                color="orange"
                currentTool={discoveryFeed.currentTool}
                recentEntries={discoveryFeed.recentEntries}
                isDone={isDiscoveryDone}
                doneLabel="Analysis complete"
              />
            </motion.div>
          </Flex>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <Flex align="center" gap="3" py="1">
              <motion.img
                src={explorerHog}
                alt=""
                animate={
                  isDiscoveryDone
                    ? { y: 0 }
                    : {
                        y: [0, -3, 0],
                        transition: {
                          duration: 0.35,
                          repeat: Infinity,
                          repeatDelay: 0.15,
                        },
                      }
                }
                style={{
                  width: 36,
                  height: 36,
                  objectFit: "contain",
                  flexShrink: 0,
                }}
              />
              <Text
                size="1"
                style={{
                  color: "var(--gray-9)",
                  fontStyle: "italic",
                }}
              >
                {isDiscoveryDone
                  ? "Pick a task to get started, or skip for now."
                  : "Hang tight while we get everything ready..."}
              </Text>
            </Flex>
          </motion.div>

          {error && (
            <Text size="2" style={{ color: "var(--red-11)" }}>
              {error}
            </Text>
          )}

          {isDiscoveryDone && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Flex direction="column" gap="4">
                {discoveredTasks.length > 0 && (
                  <Flex direction="column" gap="2">
                    <Text
                      size="3"
                      weight="medium"
                      style={{ color: "var(--gray-12)" }}
                    >
                      Recommended first tasks
                    </Text>
                    <SuggestedTasks
                      tasks={discoveredTasks}
                      onSelectTask={handleSelectTask}
                    />
                  </Flex>
                )}

                <Box>
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
        </Flex>
      </Flex>
    </ScrollArea>
  );
}
