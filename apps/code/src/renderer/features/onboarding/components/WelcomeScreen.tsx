import { ZenHedgehog } from "@components/ZenHedgehog";
import {
  ArrowRight,
  Cloud,
  CodeBlock,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Button, Flex } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark-alt.png";
import { motion } from "framer-motion";
import { FeatureListItem } from "./FeatureListItem";

const FEATURES = [
  {
    icon: <Robot size={24} />,
    title: "Use any agent or harness",
    description:
      "Bring your own agent framework or use our built-in harnesses to get started fast.",
  },
  {
    icon: <Cloud size={24} />,
    title: "Run your agent anywhere",
    description:
      "Work locally, in a worktree, or spin up cloud environments on demand.",
  },
  {
    icon: <CodeBlock size={24} />,
    title: "Review your code",
    description:
      "Inline diffs, focused reviews, and AI-assisted code understanding.",
  },
  {
    icon: <GitPullRequest size={24} />,
    title: "Create pull requests",
    description:
      "Go from task to PR with automated branch management and descriptions.",
  },
  {
    icon: <Stack size={24} />,
    title: "Run many agents at once",
    description:
      "Parallelise work across multiple agents tackling different tasks simultaneously.",
  },
];

interface WelcomeScreenProps {
  onNext: () => void;
}

export function WelcomeScreen({ onNext }: WelcomeScreenProps) {
  return (
    <>
      {/* Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgb(243, 244, 240)",
        }}
      />

      {/* Right panel — zen hedgehog */}
      <Flex
        align="center"
        justify="center"
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "55%",
          backgroundColor: "rgb(243, 244, 240)",
        }}
      >
        <ZenHedgehog />
      </Flex>

      {/* Content */}
      <Flex
        direction="column"
        flexGrow="1"
        style={{
          position: "relative",
          zIndex: 1,
          minHeight: 0,
          width: "45%",
        }}
      >
        <motion.div
          key="welcome"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          style={{ width: "100%", flex: 1, minHeight: 0 }}
        >
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
              <Flex direction="column" gap="3" mb="4">
                <img
                  src={phWordmark}
                  alt="PostHog"
                  style={{
                    height: "40px",
                    objectFit: "contain",
                    alignSelf: "flex-start",
                  }}
                />
              </Flex>

              <Flex
                direction="column"
                justify="center"
                style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
              >
                <Flex direction="column" gap="3">
                  {FEATURES.map((feature) => (
                    <FeatureListItem
                      key={feature.title}
                      icon={feature.icon}
                      title={feature.title}
                      description={feature.description}
                    />
                  ))}
                </Flex>
              </Flex>

              <Flex direction="column" gap="3" flexShrink="0" mt="4">
                <Button size="3" onClick={onNext}>
                  Get Started
                  <ArrowRight size={16} />
                </Button>
              </Flex>
            </Flex>
          </Flex>
        </motion.div>
      </Flex>
    </>
  );
}
