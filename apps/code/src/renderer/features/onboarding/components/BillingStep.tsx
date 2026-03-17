import { useSeatStore } from "@features/billing/stores/seatStore";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { useSeat } from "@hooks/useSeat";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  Check,
  WarningCircle,
} from "@phosphor-icons/react";
import { Badge, Button, Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
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
  const { isLoading, error, redirectUrl } = useSeat();
  const { provisionFreeSeat, upgradeToPro, clearError } = useSeatStore();

  useEffect(() => {
    if (!selectedPlan) {
      selectPlan("pro");
    }
  }, [selectedPlan, selectPlan]);

  useEffect(() => {
    return () => clearError();
  }, [clearError]);

  const handleContinue = async () => {
    if (selectedPlan === "free") {
      await provisionFreeSeat();
    } else {
      await upgradeToPro();
    }

    const storeState = useSeatStore.getState();
    if (!storeState.error) {
      onNext();
    }
  };

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
        <img
          src={codeLogo}
          alt="PostHog"
          style={{
            height: "24px",
            objectFit: "contain",
            alignSelf: "flex-start",
          }}
        />

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
              Choose your plan
            </Text>

            {error && !redirectUrl && (
              <Callout.Root color="red" size="1">
                <Callout.Icon>
                  <WarningCircle size={16} />
                </Callout.Icon>
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}

            {redirectUrl && (
              <Callout.Root color="amber" size="1">
                <Callout.Icon>
                  <WarningCircle size={16} />
                </Callout.Icon>
                <Callout.Text>
                  <Flex direction="column" gap="2">
                    <Text size="2">
                      Your organization needs an active billing subscription
                      before you can select a plan.
                    </Text>
                    <Button
                      size="1"
                      variant="outline"
                      color="amber"
                      onClick={() => window.open(redirectUrl, "_blank")}
                      style={{ alignSelf: "flex-start" }}
                    >
                      Set up billing
                      <ArrowSquareOut size={12} />
                    </Button>
                  </Flex>
                </Callout.Text>
              </Callout.Root>
            )}

            <Flex direction="column" gap="3">
              <PlanCard
                name="Free"
                price="$0"
                period="/month"
                features={FREE_FEATURES}
                isSelected={selectedPlan === "free"}
                onSelect={() => selectPlan("free")}
              />

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

          <Flex gap="3" align="center" justify="between" flexShrink="0" mt="6">
            <Button
              size="2"
              variant="ghost"
              onClick={onBack}
              disabled={isLoading}
              style={{ color: "var(--gray-12)" }}
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            <Button size="2" onClick={handleContinue} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner size="1" />
                  Setting up...
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={16} />
                </>
              )}
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
