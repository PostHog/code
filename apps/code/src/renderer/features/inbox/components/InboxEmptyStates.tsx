import { AnimatedEllipsis } from "@features/inbox/components/utils/AnimatedEllipsis";
import { SOURCE_PRODUCT_META } from "@features/inbox/components/utils/source-product-icons";
import { ArrowDownIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, Text, Tooltip } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import graphsHog from "@renderer/assets/images/hedgehogs/graphs-hog.png";
import mailHog from "@renderer/assets/images/mail-hog.png";

// ── Full-width empty states ─────────────────────────────────────────────────

export function WelcomePane({ onEnableInbox }: { onEnableInbox: () => void }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
    >
      <Flex direction="column" align="center" style={{ maxWidth: 420 }}>
        <img src={graphsHog} alt="" style={{ width: 120, marginBottom: 16 }} />

        <Text
          align="center"
          style={{ color: "var(--gray-12)" }}
          className="font-bold text-lg leading-6.5"
        >
          Welcome to your Inbox
        </Text>

        <Flex
          direction="column"
          align="center"
          gap="3"
          mt="3"
          style={{ maxWidth: 340 }}
        >
          <Text
            align="center"
            style={{ color: "var(--gray-11)" }}
            className="text-[13px] leading-[1.35]"
          >
            <Text style={{ color: "var(--gray-12)" }} className="font-medium">
              Background analysis of your data — while you sleep.
            </Text>
            <br />
            Session recordings watched automatically. Issues, tickets, and evals
            analyzed around the clock.
          </Text>

          <ArrowDownIcon size={14} style={{ color: "var(--gray-8)" }} />

          <Text
            align="center"
            style={{ color: "var(--gray-11)" }}
            className="text-[13px] leading-[1.35]"
          >
            <Text style={{ color: "var(--gray-12)" }} className="font-medium">
              Ready-to-run fixes for real user problems.
            </Text>
            <br />
            Each report includes evidence and impact numbers — just execute the
            prompt in your agent.
          </Text>
        </Flex>

        <Button size="2" style={{ marginTop: 20 }} onClick={onEnableInbox}>
          Enable Inbox
        </Button>
      </Flex>
    </Flex>
  );
}

export function WarmingUpPane({
  onConfigureSources,
  enabledProducts,
}: {
  onConfigureSources: () => void;
  enabledProducts: string[];
}) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
    >
      <Flex direction="column" align="center" style={{ maxWidth: 420 }}>
        <img
          src={explorerHog}
          alt=""
          style={{ width: 120, marginBottom: 16 }}
        />

        <Text
          align="center"
          style={{ color: "var(--gray-12)" }}
          className="font-bold text-lg leading-6.5"
        >
          Inbox is warming up
          <AnimatedEllipsis />
        </Text>

        <Text
          align="center"
          mt="3"
          style={{ color: "var(--gray-11)" }}
          className="text-[13px] leading-[1.35]"
        >
          Reports will appear here as soon as signals come in.
        </Text>

        <Flex align="center" gap="3" style={{ marginTop: 16 }}>
          {enabledProducts.map((sp) => {
            const meta = SOURCE_PRODUCT_META[sp];
            if (!meta) return null;
            const { Icon } = meta;
            return (
              <Tooltip key={sp} content={meta.label}>
                <span style={{ color: meta.color }}>
                  <Icon size={16} />
                </span>
              </Tooltip>
            );
          })}
          <Button
            size="2"
            variant="soft"
            color="gray"
            onClick={onConfigureSources}
          >
            Configure sources
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

export function SelectReportPane() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
    >
      <Flex direction="column" align="center" style={{ maxWidth: 300 }}>
        <img
          src={mailHog}
          alt=""
          style={{ width: 100, marginBottom: 12, opacity: 0.8 }}
        />
        <Text
          align="center"
          style={{ color: "var(--gray-10)" }}
          className="font-medium text-sm"
        >
          Select a report
        </Text>
        <Text
          align="center"
          mt="1"
          style={{ color: "var(--gray-9)" }}
          className="text-[13px] leading-[1.35]"
        >
          Pick a report from the list to see details, signals, and evidence.
        </Text>
      </Flex>
    </Flex>
  );
}

// ── Skeleton rows for backdrop behind empty states ──────────────────────────

export function SkeletonBackdrop() {
  return (
    <Flex direction="column" className="select-none" style={{ opacity: 0.4 }}>
      {Array.from({ length: 8 }).map((_, index) => (
        <Flex
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative placeholders
          key={index}
          direction="column"
          gap="2"
          px="3"
          py="3"
          className="border-gray-5 border-b"
        >
          <Box className="h-[12px] w-[44%] rounded bg-gray-4" />
          <Box className="h-[11px] w-[82%] rounded bg-gray-3" />
        </Flex>
      ))}
    </Flex>
  );
}
