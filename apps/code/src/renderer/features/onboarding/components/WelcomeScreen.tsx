import {
  ArrowRight,
  ChartLine,
  Cloud,
  GitPullRequest,
  Robot,
  Tray,
} from "@phosphor-icons/react";
import { Button, Flex, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { useCallback, useEffect, useRef, useState } from "react";
import { FeatureListItem } from "./FeatureListItem";
import { OnboardingHogTip } from "./OnboardingHogTip";
import { StepActions } from "./StepActions";

const FEATURES = [
  {
    icon: <Tray size={24} />,
    title: "Your signals inbox",
    description:
      "Automatically surfaces the highest-impact work from your product data so you always know what to do next.",
  },
  {
    icon: <ChartLine size={24} />,
    title: "Product data as context",
    description:
      "Your agents have context from your analytics, session replays and feature flags built in.",
  },
  {
    icon: <Robot size={24} />,
    title: "Any model, any harness",
    description:
      "Bring your own agent framework or use our built-in harnesses. Swap models without changing your workflow.",
  },
  {
    icon: <Cloud size={24} />,
    title: "Ship work, not messages",
    description:
      "Run tasks in parallel across local and cloud environments. Work gets done whether you're watching or not.",
  },
  {
    icon: <GitPullRequest size={24} />,
    title: "Review and ship with confidence",
    description:
      "Inline diffs, AI-assisted code review and automated pull request creation in one flow.",
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
          paddingTop: 24,
          paddingBottom: 40,
        }}
      >
        <Flex
          direction="column"
          align="center"
          style={{ flex: 1, minHeight: 0, width: "100%", overflowY: "auto" }}
        >
          <Flex
            direction="column"
            align="start"
            style={{
              width: "100%",
              maxWidth: 560,
              gap: 20,
              margin: "auto 0",
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
              <Text size="2" style={{ color: "var(--gray-11)" }}>
                Your product workbench.
              </Text>
            </Flex>

            <Flex direction="column" style={{ width: "100%", gap: 8 }}>
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
            <ArrowRight size={16} weight="bold" />
          </Button>
        </StepActions>
      </Flex>
    </Flex>
  );
}
