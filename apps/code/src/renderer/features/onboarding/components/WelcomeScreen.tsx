import {
  ArrowRight,
  ChartLine,
  Cloud,
  GitPullRequest,
  Robot,
  Stack,
} from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeatureListItem } from "./FeatureListItem";
import { OnboardingHogTip } from "./OnboardingHogTip";
import { StepActions } from "./StepActions";

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
      "Work locally, in a worktree or in the cloud with seamless handoff between environments.",
  },
  {
    icon: <ChartLine size={24} />,
    title: "Product data as context",
    description:
      "Every agent has context from your analytics, session replays and feature flags built in.",
  },
  {
    icon: <GitPullRequest size={24} />,
    title: "Review and ship with confidence",
    description:
      "Inline diffs, AI-assisted code review and automated pull request creation in one flow.",
  },
  {
    icon: <Stack size={24} />,
    title: "Run many agents at once",
    description:
      "Parallelize work across multiple agents tackling different tasks simultaneously.",
  },
];

interface WelcomeScreenProps {
  onNext: () => void;
}

const CYCLE_INTERVAL_MS = 2500;
const CYCLE_START_DELAY_MS = FEATURES.length * 100 + 400;

export function WelcomeScreen({ onNext }: WelcomeScreenProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);

  const startCycling = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % FEATURES.length);
    }, CYCLE_INTERVAL_MS);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setActiveIndex(0);
      startCycling();
    }, CYCLE_START_DELAY_MS);

    return () => {
      clearTimeout(timeout);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCycling]);

  const handleMouseEnter = (index: number) => {
    setActiveIndex(index);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleMouseLeave = () => {
    startCycling();
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        align="center"
        style={{
          width: "100%",
          height: "100%",
          paddingTop: "clamp(8px, 2vh, 24px)",
          paddingBottom: "clamp(16px, 3vh, 40px)",
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
            style={{
              width: "100%",
              maxWidth: 560,
              gap: "clamp(12px, 2.5vh, 24px)",
            }}
          >
            <Flex direction="column" gap="1">
              <Text
                size="6"
                weight="bold"
                style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
              >
                Welcome to PostHog Code
              </Text>
              <Text size="3" style={{ opacity: 0.5 }}>
                Your product workbench.
              </Text>
            </Flex>

            <Flex
              direction="column"
              style={{ width: "100%", gap: "clamp(4px, 1vh, 12px)" }}
            >
              {FEATURES.map((feature, index) => (
                <FeatureListItem
                  key={feature.title}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  active={activeIndex === index}
                  index={index}
                  onMouseEnter={() => handleMouseEnter(index)}
                  onMouseLeave={handleMouseLeave}
                />
              ))}
            </Flex>

            <OnboardingHogTip
              hogSrc={explorerHog}
              message="Let's get you set up! It only takes a minute."
            />
          </Flex>
        </Flex>

        <StepActions>
          <Button size="3" onClick={onNext}>
            Start shipping
            <ArrowRight size={16} />
          </Button>
        </StepActions>
      </Flex>
    </Flex>
  );
}
