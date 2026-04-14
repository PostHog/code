import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { ArrowLeft, ArrowRight, Check } from "@phosphor-icons/react";
import { Badge, Button, Flex, Text } from "@radix-ui/themes";

import { useEffect } from "react";

interface BillingStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface PlanFeature {
  text: string;
}

const FREE_FEATURES: PlanFeature[] = [
  { text: "Limited usage" },
  { text: "Local execution only" },
];

const PRO_FEATURES: PlanFeature[] = [
  { text: "Unlimited usage*" },
  { text: "Local and cloud execution" },
];

export function BillingStep({ onNext, onBack }: BillingStepProps) {
  const selectedPlan = useOnboardingStore((state) => state.selectedPlan);
  const selectPlan = useOnboardingStore((state) => state.selectPlan);

  useEffect(() => {
    if (!selectedPlan) {
      selectPlan("pro");
    }
  }, [selectedPlan, selectPlan]);

  const handleContinue = () => {
    onNext();
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        style={{
          width: "100%",
          maxWidth: 520,
          height: "100%",
          paddingTop: 24,
          paddingBottom: 40,
        }}
      >
        <Flex
          direction="column"
          justify="center"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex direction="column" gap="6">
            <Text
              size="6"
              weight="bold"
              style={{
                color: "var(--gray-12)",
                lineHeight: 1.3,
              }}
            >
              Pick the right fit
            </Text>
            <Flex direction="column" gap="3">
              {/* Free Plan */}
              <PlanCard
                name="Free"
                price="$0"
                period="/month"
                features={FREE_FEATURES}
                isSelected={selectedPlan === "free"}
                onSelect={() => selectPlan("free")}
              />

              {/* Pro Plan */}
              <PlanCard
                name="Pro"
                price="$200"
                period="/month"
                features={PRO_FEATURES}
                isSelected={selectedPlan === "pro"}
                onSelect={() => selectPlan("pro")}
                recommended
              />
            </Flex>
            <Text
              size="1"
              mt="3"
              style={{ color: "var(--gray-12)", opacity: 0.5 }}
            >
              * Usage is limited to "human" level usage, this cannot be used as
              your api key. If you hit this limit, please contact support.
            </Text>
          </Flex>

          <Flex gap="4" align="center" justify="between" flexShrink="0" mt="6">
            <Button size="3" variant="outline" color="gray" onClick={onBack}>
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button size="3" onClick={handleContinue}>
              Continue
              <ArrowRight size={16} />
            </Button>
          </Flex>
        </Flex>
      </Flex>
    </Flex>
  );
}

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  features: PlanFeature[];
  isSelected: boolean;
  onSelect: () => void;
  recommended?: boolean;
}

function PlanCard({
  name,
  price,
  period,
  features,
  isSelected,
  onSelect,
  recommended,
}: PlanCardProps) {
  return (
    <Flex
      direction="column"
      gap="4"
      p="5"
      onClick={onSelect}
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: isSelected
          ? "2px solid var(--accent-9)"
          : "2px solid var(--gray-4)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <Flex align="center" justify="between">
        <Flex direction="column" gap="1">
          <Flex align="center" gap="2">
            <Text size="4" weight="bold" style={{ color: "var(--gray-12)" }}>
              {name}
            </Text>
            {recommended && (
              <Badge color="orange" size="1">
                Recommended
              </Badge>
            )}
          </Flex>
          <Flex align="baseline" gap="1">
            <Text size="7" weight="bold" style={{ color: "var(--gray-12)" }}>
              {price}
            </Text>
            <Text size="2" style={{ color: "var(--gray-12)", opacity: 0.6 }}>
              {period}
            </Text>
          </Flex>
        </Flex>

        <Button
          size="2"
          variant={isSelected ? "solid" : "outline"}
          style={
            isSelected
              ? {
                  backgroundColor: "var(--accent-9)",
                  color: "white",
                }
              : {
                  color: "var(--gray-12)",
                }
          }
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
      </Flex>

      <Flex direction="column" gap="2">
        {features.map((feature) => (
          <Flex key={feature.text} align="center" gap="2">
            <Check
              size={14}
              weight="bold"
              style={{ color: "var(--accent-9)", flexShrink: 0 }}
            />
            <Text size="2" style={{ color: "var(--gray-12)", opacity: 0.8 }}>
              {feature.text}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Flex>
  );
}
