import {
  ArrowRight,
  Cloud,
  CodeBlock,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { motion } from "framer-motion";
import { FeatureListItem } from "./FeatureListItem";
import { OnboardingHogTip } from "./OnboardingHogTip";

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
          align="center"
          style={{ flex: 1, minHeight: 0, width: "100%" }}
        >
          <Flex
            direction="column"
            align="start"
            gap="6"
            style={{ width: "100%", maxWidth: 560 }}
          >
            <Text size="6" style={{ color: "var(--gray-12)", lineHeight: 1.3 }}>
              Welcome to PostHog Code
            </Text>

            <Flex direction="column" gap="3" style={{ width: "100%" }}>
              {FEATURES.map((feature) => (
                <FeatureListItem
                  key={feature.title}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                />
              ))}
            </Flex>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <OnboardingHogTip
                hogSrc={explorerHog}
                message="Let's get you set up. It only takes a minute."
              />
            </motion.div>
          </Flex>
        </Flex>

        <Flex gap="3" align="center" flexShrink="0">
          <Button size="3" onClick={onNext}>
            Get Started
            <ArrowRight size={16} />
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
