import {
  ArrowRight,
  Cloud,
  CodeBlock,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Button, Flex } from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
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
            src={codeLogo}
            alt="PostHog Code"
            style={{
              height: "24px",
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

        <Flex gap="3" align="center" flexShrink="0" mt="4">
          <Button size="3" radius="medium" onClick={onNext}>
            Get started
            <ArrowRight size={16} />
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}
