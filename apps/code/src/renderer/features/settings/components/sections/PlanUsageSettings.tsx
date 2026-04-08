import { useSeatStore } from "@features/billing/stores/seatStore";
import { useSeat } from "@hooks/useSeat";
import {
  ArrowSquareOut,
  Check,
  CreditCard,
  WarningCircle,
} from "@phosphor-icons/react";
import {
  Button,
  Callout,
  Dialog,
  Flex,
  Progress,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import { logger } from "@utils/logger";
import { getPostHogUrl } from "@utils/urls";
import { useEffect, useState } from "react";

const log = logger.scope("plan-usage");

interface UsageBucket {
  used_usd: number;
  limit_usd: number;
  remaining_usd: number;
  resets_in_seconds: number;
  exceeded: boolean;
}

interface UsageData {
  sustained: UsageBucket;
  burst: UsageBucket;
  is_rate_limited: boolean;
}

function formatUsd(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatResetTime(seconds: number): string {
  const days = Math.ceil(seconds / 86400);
  if (days === 1) return "1 day";
  return `${days} days`;
}

function useUsage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    trpcClient.llmGateway.usage
      .query()
      .then((data) => {
        if (!cancelled) setUsage(data);
      })
      .catch((error) => {
        log.warn("Failed to fetch usage", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { usage, isLoading };
}

export function PlanUsageSettings() {
  const {
    seat,
    isPro,
    isCanceling,
    activeUntil,
    isLoading,
    error,
    redirectUrl,
  } = useSeat();
  const { upgradeToPro, cancelSeat, reactivateSeat, clearError } =
    useSeatStore();
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const { usage, isLoading: usageLoading } = useUsage();

  const formattedActiveUntil = activeUntil
    ? activeUntil.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : null;

  const daysUntilReset = activeUntil
    ? Math.max(
        0,
        Math.ceil((activeUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      )
    : null;

  return (
    <Flex direction="column" gap="5">
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
                Your organization needs an active billing subscription before
                you can select a plan.
              </Text>
              <Button
                size="1"
                variant="outline"
                color="amber"
                onClick={() => {
                  window.open(redirectUrl, "_blank");
                  clearError();
                }}
                style={{ alignSelf: "flex-start" }}
              >
                Set up billing
                <ArrowSquareOut size={12} />
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}

      <Flex gap="3">
        {seat ? (
          <>
            <PlanCard
              name="Free"
              price="$0"
              period="/mo"
              features={[
                "Limited usage",
                "Local execution only",
                "All Claude and Codex models",
              ]}
              isCurrent={!isPro}
            />
            <PlanCard
              name="Pro"
              price="$200"
              period="/mo"
              features={[
                "Unlimited usage*",
                "Local and cloud execution",
                "All Claude and Codex models",
              ]}
              isCurrent={isPro}
              resetLabel={
                isPro && isCanceling && formattedActiveUntil
                  ? `Cancels ${formattedActiveUntil}`
                  : isPro && formattedActiveUntil && daysUntilReset !== null
                    ? `Resets ${formattedActiveUntil} (${daysUntilReset} days)`
                    : undefined
              }
              action={
                isPro ? (
                  isCanceling ? (
                    <Button
                      size="1"
                      variant="solid"
                      onClick={reactivateSeat}
                      disabled={isLoading}
                      style={{ alignSelf: "flex-start" }}
                    >
                      {isLoading ? <Spinner size="1" /> : "Reactivate"}
                    </Button>
                  ) : (
                    <Button
                      size="1"
                      variant="outline"
                      color="red"
                      onClick={cancelSeat}
                      disabled={isLoading}
                      style={{ alignSelf: "flex-start" }}
                    >
                      {isLoading ? <Spinner size="1" /> : "Cancel plan"}
                    </Button>
                  )
                ) : (
                  <Button
                    size="1"
                    variant="solid"
                    onClick={() => setShowUpgradeDialog(true)}
                    disabled={isLoading}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {isLoading ? <Spinner size="1" /> : "Upgrade"}
                  </Button>
                )
              }
            />
          </>
        ) : (
          <Flex
            align="center"
            justify="center"
            p="6"
            style={{
              flex: 1,
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
            }}
          >
            {isLoading ? (
              <Spinner size="2" />
            ) : (
              <Text size="2" color="gray">
                No plan selected
              </Text>
            )}
          </Flex>
        )}
      </Flex>

      <Flex direction="column" gap="3">
        <Text size="2" weight="medium" style={{ color: "var(--gray-9)" }}>
          Usage
        </Text>
        {usageLoading ? (
          <Flex
            align="center"
            justify="center"
            p="4"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <Spinner size="2" />
          </Flex>
        ) : usage ? (
          <Flex direction="column" gap="3">
            <UsageMeter
              label="Sustained"
              bucket={usage.sustained}
              color={usage.sustained.exceeded ? "red" : undefined}
            />
            <UsageMeter
              label="Burst"
              bucket={usage.burst}
              color={usage.burst.exceeded ? "red" : undefined}
            />
          </Flex>
        ) : (
          <Flex
            direction="column"
            gap="3"
            p="4"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <Text size="2" color="gray">
              Unable to load usage data
            </Text>
          </Flex>
        )}
      </Flex>

      {isPro && (
        <Flex direction="column" gap="3">
          <Text size="2" weight="medium" style={{ color: "var(--gray-9)" }}>
            Billing
          </Text>
          <Flex
            align="center"
            justify="between"
            p="4"
            style={{
              border: "1px solid var(--gray-5)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <Flex align="center" gap="3">
              <CreditCard size={18} style={{ color: "var(--gray-9)" }} />
              <Text size="2">Manage billing and invoices</Text>
            </Flex>
            <Button
              size="1"
              variant="outline"
              onClick={() => {
                const url = getPostHogUrl("/organization/billing");
                window.open(url, "_blank");
              }}
            >
              Open
              <ArrowSquareOut size={12} />
            </Button>
          </Flex>
        </Flex>
      )}
      <Dialog.Root open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <Dialog.Content maxWidth="420px" size="2">
          <Dialog.Title size="3">Upgrade to Pro</Dialog.Title>
          <Dialog.Description size="2" color="gray">
            You are about to subscribe to the Pro plan. Your organization will
            be charged $200/month starting immediately.
          </Dialog.Description>
          <Flex direction="column" gap="2" mt="3">
            <Flex align="center" gap="2">
              <Check
                size={14}
                weight="bold"
                style={{ color: "var(--accent-9)" }}
              />
              <Text size="2">Unlimited token usage</Text>
            </Flex>
            <Flex align="center" gap="2">
              <Check
                size={14}
                weight="bold"
                style={{ color: "var(--accent-9)" }}
              />
              <Text size="2">Local and cloud execution</Text>
            </Flex>
            <Flex align="center" gap="2">
              <Check
                size={14}
                weight="bold"
                style={{ color: "var(--accent-9)" }}
              />
              <Text size="2">All Claude and Codex models</Text>
            </Flex>
          </Flex>
          <Flex justify="end" gap="3" mt="4">
            <Dialog.Close>
              <Button variant="soft" color="gray" size="2">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              size="2"
              onClick={async () => {
                setShowUpgradeDialog(false);
                await upgradeToPro();
              }}
              disabled={isLoading}
            >
              {isLoading ? <Spinner size="1" /> : "Subscribe — $200/mo"}
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

interface UsageMeterProps {
  label: string;
  bucket: UsageBucket;
  color?: "red";
}

function UsageMeter({ label, bucket, color }: UsageMeterProps) {
  const percentage =
    bucket.limit_usd > 0
      ? Math.min(100, (bucket.used_usd / bucket.limit_usd) * 100)
      : 0;

  const borderColor = color === "red" ? "var(--red-7)" : "var(--gray-5)";

  return (
    <Flex
      direction="column"
      gap="3"
      p="4"
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: "var(--radius-3)",
      }}
    >
      <Flex align="center" justify="between">
        <Text size="2" weight="medium">
          {label}
        </Text>
        <Text size="2" weight="medium">
          {formatUsd(bucket.used_usd)} / {formatUsd(bucket.limit_usd)}
        </Text>
      </Flex>
      <Progress
        value={percentage}
        size="2"
        color={color === "red" ? "red" : undefined}
      />
      <Text size="1" style={{ color: "var(--gray-9)" }}>
        {bucket.exceeded
          ? "Limit exceeded"
          : `${formatUsd(bucket.remaining_usd)} remaining \u00b7 resets in ${formatResetTime(bucket.resets_in_seconds)}`}
      </Text>
    </Flex>
  );
}

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  features: string[];
  isCurrent: boolean;
  resetLabel?: string;
  action?: React.ReactNode;
}

function PlanCard({
  name,
  price,
  period,
  features,
  isCurrent,
  resetLabel,
  action,
}: PlanCardProps) {
  return (
    <Flex
      direction="column"
      justify="between"
      gap="3"
      p="4"
      style={{
        flex: 1,
        border: isCurrent
          ? "1px solid var(--accent-7)"
          : "1px solid var(--gray-5)",
        borderRadius: "var(--radius-3)",
        opacity: isCurrent ? 1 : 0.7,
      }}
    >
      <Flex direction="column" gap="3">
        <Flex direction="column" gap="1">
          <Text
            size="1"
            weight="medium"
            style={{
              color: isCurrent ? "var(--accent-9)" : "var(--gray-9)",
              letterSpacing: "0.05em",
            }}
          >
            {isCurrent ? "CURRENT PLAN" : name.toUpperCase()}
          </Text>
          <Flex align="baseline" gap="2">
            <Text size="5" weight="bold">
              {name}
            </Text>
            <Text size="3" style={{ color: "var(--gray-11)" }}>
              {price}
              <Text size="1" style={{ color: "var(--gray-9)" }}>
                {period}
              </Text>
            </Text>
          </Flex>
          {resetLabel && (
            <Text size="1" style={{ color: "var(--gray-9)" }}>
              {resetLabel}
            </Text>
          )}
        </Flex>
        <Flex direction="column" gap="1">
          {features.map((feature) => (
            <Flex key={feature} align="center" gap="2">
              <Check
                size={14}
                weight="bold"
                style={{ color: "var(--accent-9)", flexShrink: 0 }}
              />
              <Text size="2" style={{ color: "var(--gray-11)" }}>
                {feature}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Flex>
      {action}
    </Flex>
  );
}
