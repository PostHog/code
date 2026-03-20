import { SignalReportPriorityBadge } from "@features/inbox/components/SignalReportPriorityBadge";
import { SignalReportSummaryMarkdown } from "@features/inbox/components/SignalReportSummaryMarkdown";
import {
  inboxStatusAccentCss,
  inboxStatusLabel,
} from "@features/inbox/utils/inboxSort";
import { Flex, Text } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { motion } from "framer-motion";
import type { KeyboardEvent, MouseEvent } from "react";

interface ReportCardProps {
  report: SignalReport;
  isSelected: boolean;
  onClick: () => void;
  index: number;
}

export function ReportCard({
  report,
  isSelected,
  onClick,
  index,
}: ReportCardProps) {
  const updatedAtLabel = new Date(report.updated_at).toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    },
  );

  const isStrongSignal = report.total_weight >= 65 || report.signal_count >= 20;
  const isMediumSignal = report.total_weight >= 30 || report.signal_count >= 6;
  const strengthColor = isStrongSignal
    ? "var(--green-9)"
    : isMediumSignal
      ? "var(--yellow-9)"
      : "var(--gray-8)";
  const strengthLabel = isStrongSignal
    ? "strong"
    : isMediumSignal
      ? "medium"
      : "light";

  const accent = inboxStatusAccentCss(report.status);
  const statusLabel = inboxStatusLabel(report.status);
  const isReady = report.status === "ready";

  const handleActivate = (e: MouseEvent | KeyboardEvent): void => {
    if ((e.target as HTMLElement).closest("a")) {
      return;
    }
    onClick();
  };

  return (
    <motion.div
      role="button"
      tabIndex={0}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.22,
        delay: Math.min(index * 0.035, 0.35),
        ease: [0.22, 1, 0.36, 1],
      }}
      onClick={handleActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleActivate(e);
        }
      }}
      className="w-full cursor-pointer overflow-hidden border-gray-5 border-b py-2 pr-3 pl-2 text-left transition-colors hover:bg-gray-2"
      style={{
        backgroundColor: isSelected ? "var(--gray-3)" : "transparent",
        boxShadow: `inset 3px 0 0 0 ${accent}`,
      }}
    >
      <Flex align="start" justify="between" gap="3">
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gapX="2" wrap="wrap">
            <span
              title={`Signal strength: ${strengthLabel}`}
              aria-hidden
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "9999px",
                backgroundColor: strengthColor,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            <Text
              size="1"
              weight="medium"
              className="block min-w-0 truncate font-mono text-[12px]"
            >
              {report.title ?? "Untitled signal"}
            </Text>
            <Flex align="center" gapX="2" wrap="wrap">
              <span
                className="shrink-0 rounded-sm px-1 py-px font-mono text-[9px] uppercase tracking-wider"
                style={{
                  color: accent,
                  backgroundColor: isReady ? "var(--green-3)" : "var(--gray-3)",
                  border: `1px solid ${isReady ? "var(--green-6)" : "var(--gray-6)"}`,
                }}
              >
                {statusLabel}
              </span>
              <SignalReportPriorityBadge priority={report.priority} />
            </Flex>
            <div style={{ opacity: isReady ? 1 : 0.82 }}>
              <SignalReportSummaryMarkdown
                content={report.summary}
                fallback="No summary yet — still collecting context."
                variant="list"
              />
            </div>
          </Flex>
        </Flex>
        <Flex direction="column" align="end" gap="1" className="shrink-0">
          <Text size="1" color="gray" className="font-mono text-[11px]">
            {updatedAtLabel}
          </Text>
          <Text size="1" color="gray" className="font-mono text-[10px]">
            w:{report.total_weight.toFixed(2)}
          </Text>
        </Flex>
      </Flex>
    </motion.div>
  );
}
