import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import {
  BugIcon,
  GithubLogoIcon,
  KanbanIcon,
  SparkleIcon,
  TicketIcon,
  VideoIcon,
} from "@phosphor-icons/react";
import { Button, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SignalSourceConfig } from "@renderer/api/posthogClient";
import explorerHog from "@renderer/assets/images/explorer-hog.png";
import { type ReactNode, useMemo } from "react";

const SOURCE_DISPLAY_ORDER: SignalSourceConfig["source_product"][] = [
  "session_replay",
  "error_tracking",
  "github",
  "linear",
  "zendesk",
];

function sourceIcon(product: SignalSourceConfig["source_product"]): ReactNode {
  const common = { size: 20 as const };
  switch (product) {
    case "session_replay":
      return <VideoIcon {...common} />;
    case "error_tracking":
      return <BugIcon {...common} />;
    case "github":
      return <GithubLogoIcon {...common} />;
    case "linear":
      return <KanbanIcon {...common} />;
    case "zendesk":
      return <TicketIcon {...common} />;
    default:
      return <SparkleIcon {...common} />;
  }
}

function sourceProductTooltipLabel(
  product: SignalSourceConfig["source_product"],
): string {
  switch (product) {
    case "session_replay":
      return "PostHog Session Replay";
    case "error_tracking":
      return "PostHog Error Tracking";
    case "github":
      return "GitHub Issues";
    case "linear":
      return "Linear";
    case "zendesk":
      return "Zendesk";
    default:
      return "Signal source";
  }
}

function AnimatedEllipsis({ className }: { className?: string }) {
  return (
    <span className={className} aria-hidden>
      <span className="inline-flex items-end gap-px leading-none">
        <span className="inbox-ellipsis-dot">.</span>
        <span className="inbox-ellipsis-dot">.</span>
        <span className="inbox-ellipsis-dot">.</span>
      </span>
    </span>
  );
}

interface InboxWarmingUpStateProps {
  onConfigureSources: () => void;
}

export function InboxWarmingUpState({
  onConfigureSources,
}: InboxWarmingUpStateProps) {
  const { data: configs } = useSignalSourceConfigs();

  const enabledProducts = useMemo(() => {
    const seen = new Set<string>();
    return (configs ?? [])
      .filter((c) => c.enabled)
      .sort(
        (a, b) =>
          SOURCE_DISPLAY_ORDER.indexOf(a.source_product) -
          SOURCE_DISPLAY_ORDER.indexOf(b.source_product),
      )
      .filter((c) => {
        if (seen.has(c.source_product)) return false;
        seen.add(c.source_product);
        return true;
      });
  }, [configs]);

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
      style={{ margin: "0 auto" }}
    >
      <Flex direction="column" align="center" style={{ maxWidth: 420 }}>
        <img
          src={explorerHog}
          alt=""
          style={{ width: 128, marginBottom: 20 }}
        />

        <Text
          size="4"
          weight="bold"
          align="center"
          as="div"
          style={{ color: "var(--gray-12)" }}
        >
          Inbox is warming up
          <AnimatedEllipsis />
        </Text>

        <Text
          size="1"
          align="center"
          mt="3"
          style={{ color: "var(--gray-11)", lineHeight: 1.35 }}
        >
          Reports will appear here as soon as signals come in.
        </Text>

        <Flex align="center" gap="3" mt="4">
          {enabledProducts.map((cfg) => (
            <Tooltip
              key={cfg.id}
              content={sourceProductTooltipLabel(cfg.source_product)}
              delayDuration={300}
            >
              <span style={{ color: "var(--gray-9)", display: "inline-flex" }}>
                {sourceIcon(cfg.source_product)}
              </span>
            </Tooltip>
          ))}
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
