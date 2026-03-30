import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import {
  BrainIcon,
  GithubLogoIcon,
  KanbanIcon,
  SparkleIcon,
  TicketIcon,
  VideoIcon,
} from "@phosphor-icons/react";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SignalSourceConfig } from "@renderer/api/posthogClient";
import { motion } from "framer-motion";
import { type ReactNode, useMemo } from "react";

const SOURCE_DISPLAY_ORDER: SignalSourceConfig["source_product"][] = [
  "session_replay",
  "llm_analytics",
  "github",
  "linear",
  "zendesk",
];

function sourceIcon(product: SignalSourceConfig["source_product"]): ReactNode {
  const common = { size: 22 as const };
  switch (product) {
    case "session_replay":
      return <VideoIcon {...common} />;
    case "llm_analytics":
      return <BrainIcon {...common} />;
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

export function InboxWarmingUpState() {
  const { data: configs } = useSignalSourceConfigs();
  const openSignalSettings = useSettingsDialogStore((s) => s.open);

  const enabledSources = useMemo(() => {
    const enabled = (configs ?? []).filter((c) => c.enabled);
    return [...enabled].sort(
      (a, b) =>
        SOURCE_DISPLAY_ORDER.indexOf(a.source_product) -
        SOURCE_DISPLAY_ORDER.indexOf(b.source_product),
    );
  }, [configs]);

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="4"
      height="100%"
      px="4"
      className="text-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      >
        <SparkleIcon size={28} className="text-amber-9" />
      </motion.div>

      <Flex direction="column" gap="2" style={{ maxWidth: 520 }}>
        <Text size="4" weight="medium">
          Inbox is warming up
        </Text>
        <Text size="1" color="gray" className="text-[12px] leading-relaxed">
          Reports appear here as soon as signals are grouped. Research usually
          finishes within a minute while we watch your connected sources.
        </Text>
        <Text size="1" color="gray" className="text-[12px]" as="div">
          <span className="text-gray-10">Processing signals</span>
          <AnimatedEllipsis className="text-gray-10" />
        </Text>
      </Flex>

      {enabledSources.length > 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.4 }}
          className="w-full"
          style={{ maxWidth: 420 }}
        >
          <Text
            size="1"
            color="gray"
            className="mb-2 block text-[11px] uppercase tracking-wider"
          >
            Data connected
          </Text>
          <Tooltip content="Go to signal source settings">
            <button
              type="button"
              onClick={() => openSignalSettings("signals")}
              aria-label="Go to signal source settings"
              className="group inline-flex max-w-full cursor-pointer flex-col items-center border-0 bg-transparent p-0 text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-8 focus-visible:outline-offset-2"
            >
              <Flex
                align="center"
                justify="center"
                gap="3"
                wrap="wrap"
                className="justify-center"
              >
                {enabledSources.map((cfg, i) => (
                  <motion.div
                    key={cfg.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      delay: 0.08 + i * 0.06,
                      duration: 0.35,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border transition-colors group-hover:bg-gray-3"
                    style={{
                      borderColor: "var(--gray-6)",
                      backgroundColor: "var(--gray-2)",
                      color: "var(--gray-11)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
                    }}
                  >
                    {sourceIcon(cfg.source_product)}
                  </motion.div>
                ))}
              </Flex>
            </button>
          </Tooltip>
        </motion.div>
      ) : null}
    </Flex>
  );
}
