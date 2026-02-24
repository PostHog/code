import {
  ArrowRight,
  Cloud,
  CodeBlock,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Box, Button, Flex } from "@radix-ui/themes";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { useFeatureRotation } from "../hooks/useFeatureRotation";
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
  const { activeIndex, onHover, onLeave } = useFeatureRotation(FEATURES.length);

  return (
    <Flex align="center" height="100%" px="8">
      {/* Left side - features list */}
      <Flex
        direction="column"
        gap="4"
        style={{ width: "45%", maxWidth: 480 }}
        pr="6"
      >
        <Flex direction="column" gap="3" mb="4">
          <img
            src={twigLogo}
            alt="Twig"
            style={{
              height: "40px",
              objectFit: "contain",
              alignSelf: "flex-start",
            }}
          />
        </Flex>

        <Flex direction="column" gap="1">
          {FEATURES.map((feature, index) => (
            <FeatureListItem
              key={feature.title}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              isActive={index === activeIndex}
              onMouseEnter={() => onHover(index)}
              onMouseLeave={onLeave}
            />
          ))}
        </Flex>

        <Box mt="2">
          <Button
            size="3"
            onClick={onNext}
            style={{
              backgroundColor: "var(--cave-charcoal)",
              color: "var(--cave-cream)",
            }}
          >
            Get Started
            <ArrowRight size={16} />
          </Button>
        </Box>
      </Flex>
    </Flex>
  );
}
