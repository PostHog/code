import { AnimatedEllipsis } from "@features/inbox/components/utils/AnimatedEllipsis";
import { SOURCE_PRODUCT_META } from "@features/inbox/components/utils/source-product-icons";
import { ArrowDownIcon } from "@phosphor-icons/react";
import { Button, Flex, Text, Tooltip } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import graphsHog from "@renderer/assets/images/hedgehogs/graphs-hog.png";
import mailHog from "@renderer/assets/images/mail-hog.png";

interface InboxEmptyStateProps {
  hasSignalSources: boolean;
  hasGithubIntegration: boolean;
  onEnableInbox: () => void;
  enabledProducts?: string[];
}

/** Shown when inbox hasn't been set up (no sources or no GitHub). */
function WelcomeState({ onEnableInbox }: { onEnableInbox: () => void }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="flex-1"
      px="5"
    >
      <Flex direction="column" align="center" className="max-w-[420px]">
        <img src={graphsHog} alt="" className="mb-4 w-[120px]" />

        <Text
          align="center"
          className="font-bold text-(--gray-12) text-lg leading-6.5"
        >
          Welcome to your Inbox
        </Text>

        <Flex
          direction="column"
          align="center"
          gap="3"
          mt="3"
          className="max-w-[340px]"
        >
          <Text
            align="center"
            className="text-(--gray-11) text-[13px] leading-[1.4]"
          >
            <Text className="font-medium text-(--gray-12)">
              Background analysis of your data — while you sleep.
            </Text>
            <br />
            Session recordings watched automatically. Issues, tickets, and evals
            analyzed around the clock.
          </Text>

          <ArrowDownIcon size={14} className="text-(--gray-8)" />

          <Text
            align="center"
            className="text-(--gray-11) text-[13px] leading-[1.4]"
          >
            <Text className="font-medium text-(--gray-12)">
              Ready-to-run fixes for real user problems.
            </Text>
            <br />
            Each report includes evidence and impact numbers — review, merge, or
            dismiss in seconds.
          </Text>
        </Flex>

        <Button size="2" onClick={onEnableInbox} className="mt-5">
          Enable Inbox
        </Button>
      </Flex>
    </Flex>
  );
}

/** Shown when sources are enabled but no data has arrived yet. */
function WarmingUpState({
  enabledProducts,
  onEnableInbox,
}: {
  enabledProducts: string[];
  onEnableInbox: () => void;
}) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="flex-1"
      px="5"
    >
      <Flex direction="column" align="center" className="max-w-[440px]">
        <img src={explorerHog} alt="" className="mb-4 w-[120px]" />

        <Text
          align="center"
          className="font-bold text-(--gray-12) text-lg leading-6.5"
        >
          Your Inbox is warming up
          <AnimatedEllipsis />
        </Text>

        <Text
          align="center"
          mt="3"
          className="text-balance font-medium text-(--gray-11) text-[13px] leading-[1.4]"
        >
          Agents are watching your product signals and researching patterns.
          <br />
          Pull requests and reports will appear here as findings are ready.
        </Text>

        <Flex direction="column" align="center" gap="2" mt="4">
          <Text className="text-(--gray-9) text-[11px] uppercase tracking-wider">
            Listening to
          </Text>
          <Flex align="center" gap="3">
            {enabledProducts.map((sp) => {
              const meta = SOURCE_PRODUCT_META[sp];
              if (!meta) return null;
              return (
                <Tooltip key={sp} content={meta.label}>
                  <span style={{ color: meta.color }}>
                    <meta.Icon size={16} />
                  </span>
                </Tooltip>
              );
            })}
          </Flex>
        </Flex>

        <Button
          size="2"
          variant="soft"
          color="gray"
          onClick={onEnableInbox}
          className="mt-4"
        >
          Configure sources
        </Button>
      </Flex>
    </Flex>
  );
}

/** Shown in the list area when the active tab has no items. */
export function TabEmptyState({ tab }: { tab: "pull-requests" | "reports" }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="flex-1 py-16"
      px="5"
    >
      <Flex direction="column" align="center" className="max-w-[320px]">
        <img src={mailHog} alt="" className="mb-3 w-[80px] opacity-70" />
        <Text align="center" className="font-medium text-(--gray-11) text-sm">
          {tab === "pull-requests"
            ? "No pull requests yet"
            : "No reports to show"}
        </Text>
        <Text
          align="center"
          mt="1"
          className="text-(--gray-9) text-[13px] leading-[1.4]"
        >
          {tab === "pull-requests"
            ? "When the agent creates PRs from researched signals, they\u2019ll appear here for you to review and merge."
            : "Reports from the research agent will show up here as signals are investigated."}
        </Text>
      </Flex>
    </Flex>
  );
}

/** Shown when filters exclude all results. */
export function FilterEmptyState({
  onClearFilters,
}: {
  onClearFilters: () => void;
}) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      className="flex-1 py-16"
      px="5"
    >
      <Flex direction="column" align="center" className="max-w-[280px]">
        <img src={explorerHog} alt="" className="mb-3 w-[72px] opacity-60" />
        <Text align="center" className="font-medium text-(--gray-11) text-sm">
          No matches
        </Text>
        <Text
          align="center"
          mt="1"
          className="text-(--gray-9) text-[13px] leading-[1.4]"
        >
          Nothing matches the current filters.
        </Text>
        <Button
          size="2"
          variant="soft"
          color="gray"
          onClick={onClearFilters}
          className="mt-3"
        >
          Clear filters
        </Button>
      </Flex>
    </Flex>
  );
}

export function InboxEmptyState({
  hasSignalSources,
  hasGithubIntegration,
  onEnableInbox,
  enabledProducts = [],
}: InboxEmptyStateProps) {
  if (!hasSignalSources || !hasGithubIntegration) {
    return <WelcomeState onEnableInbox={onEnableInbox} />;
  }

  return (
    <WarmingUpState
      enabledProducts={enabledProducts}
      onEnableInbox={onEnableInbox}
    />
  );
}
