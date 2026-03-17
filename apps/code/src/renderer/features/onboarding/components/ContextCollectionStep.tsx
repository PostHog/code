import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { useContextCollection } from "../hooks/useContextCollection";
import { SourceFeed } from "./context-collection/SourceFeed";
import { SuggestedTasks } from "./context-collection/SuggestedTasks";

interface ContextCollectionStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ContextCollectionStep({
  onNext,
  onBack,
}: ContextCollectionStepProps) {
  const { sources, phase, isAllDone, totalItems } = useContextCollection();
  const [showTasks, setShowTasks] = useState(false);

  // Delay showing tasks briefly after scanning completes for a smooth transition
  useEffect(() => {
    if (!isAllDone) return;
    const timeout = setTimeout(() => setShowTasks(true), 800);
    return () => clearTimeout(timeout);
  }, [isAllDone]);

  return (
    <Flex
      align="center"
      height="100%"
      px="8"
      style={{ position: "relative", zIndex: 1 }}
    >
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
        {/* Content area */}
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
              minWidth: 520,
              maxWidth: 520,
              margin: "0 auto",
              backgroundColor: "rgba(243, 244, 240, 0.85)",
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
                    {/* Title */}
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
                          Building your context...
                        </Text>
                        <Text size="2" style={{ color: "var(--gray-11)" }}>
                          Scanning your data sources for insights and
                          priorities.
                        </Text>
                      </Flex>
                    </motion.div>

                    {/* Source feed */}
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.05 }}
                    >
                      <SourceFeed sources={sources} />
                    </motion.div>

                    {/* Phase status + hedgehog */}
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
                    {/* Title */}
                    <Flex direction="column" gap="2">
                      <Text
                        size="6"
                        style={{
                          color: "var(--gray-12)",
                          lineHeight: 1.3,
                        }}
                      >
                        Here's what we found
                      </Text>
                      <Text size="2" style={{ color: "var(--gray-11)" }}>
                        Based on {totalItems.toLocaleString()} items across your
                        data sources, we recommend starting with one of these:
                      </Text>
                    </Flex>

                    {/* Task cards */}
                    <SuggestedTasks onSelectTask={() => onNext()} />
                  </Flex>
                </motion.div>
              )}
            </AnimatePresence>
          </Flex>
        </Flex>

        {/* Footer buttons */}
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
            <AnimatePresence>
              {showTasks && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.3 }}
                >
                  <Button size="3" variant="ghost" onClick={onNext}>
                    Skip for now
                    <ArrowRight size={16} />
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Flex>
        </motion.div>
      </Flex>
    </Flex>
  );
}
