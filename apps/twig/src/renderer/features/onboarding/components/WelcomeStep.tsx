import {
  ArrowRight,
  Cloud,
  CodeBlock,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Box, Button, Flex } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark-alt.png";
import { FeatureListItem } from "./FeatureListItem";

interface WelcomeStepProps {
  onNext: () => void;
}

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

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <Flex height="100%">
      {/* Left side - features list */}
      <Flex
        direction="column"
        justify="center"
        gap="4"
        style={{
          width: "100%",
          maxWidth: 520,
          paddingLeft: "var(--space-8)",
          paddingRight: "var(--space-6)",
          height: "100%",
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

        <Box mt="2">
          <Button size="3" onClick={onNext}>
            Get Started
            <ArrowRight size={16} />
          </Button>
        </Box>
      </Flex>
    </Flex>
  );
}
