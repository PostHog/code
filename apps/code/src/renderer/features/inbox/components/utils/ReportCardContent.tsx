import { Badge } from "@components/ui/Badge";
import { SignalReportActionabilityBadge } from "@features/inbox/components/utils/SignalReportActionabilityBadge";
import { SignalReportPriorityBadge } from "@features/inbox/components/utils/SignalReportPriorityBadge";
import { SignalReportStatusBadge } from "@features/inbox/components/utils/SignalReportStatusBadge";
import { SignalReportSummaryMarkdown } from "@features/inbox/components/utils/SignalReportSummaryMarkdown";
import { EyeIcon, LightningIcon } from "@phosphor-icons/react";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";

interface ReportCardContentProps {
  report: SignalReport;
  /** Show signal count, user count, and date in a meta row below the summary. */
  showMeta?: boolean;
}

export function ReportCardContent({
  report,
  showMeta = false,
}: ReportCardContentProps) {
  const isReady = report.status === "ready";

  const updatedAtLabel = new Date(report.updated_at).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric" },
  );

  return (
    <Flex direction="column" gap="1">
      <Flex align="start" gapX="2" className="min-w-0">
        <Flex align="center" gapX="2" wrap="wrap" className="min-w-0 flex-1">
          <Text
            size="1"
            weight="medium"
            className="min-w-0 flex-1 basis-0 truncate text-[13px]"
          >
            {report.title ?? "Untitled signal"}
          </Text>
          {!isReady && <SignalReportStatusBadge status={report.status} />}
          <SignalReportPriorityBadge priority={report.priority} />
          <SignalReportActionabilityBadge
            actionability={report.actionability}
          />
          {report.is_suggested_reviewer && (
            <Tooltip content="You are a suggested reviewer">
              <Badge color="amber" style={{ height: "var(--line-height-1)" }}>
                <EyeIcon size={10} weight="bold" className="shrink-0" />
              </Badge>
            </Tooltip>
          )}
        </Flex>

        {!showMeta && (
          <Text size="1" color="gray" className="shrink-0 text-[12px]">
            {updatedAtLabel}
          </Text>
        )}
      </Flex>

      <div className="min-w-0" style={{ opacity: isReady ? 1 : 0.82 }}>
        <SignalReportSummaryMarkdown
          content={report.summary}
          fallback="No summary yet — still collecting context."
          variant="list"
          pending={!isReady}
        />
      </div>

      {showMeta && (
        <Flex align="center" gapX="3" className="text-[11px] text-gray-9">
          <Flex align="center" gapX="1">
            <LightningIcon size={11} />
            <Text size="1" className="text-[11px]">
              {report.signal_count} signal
              {report.signal_count !== 1 ? "s" : ""}
            </Text>
          </Flex>
          <Text size="1" className="text-[11px]">
            {updatedAtLabel}
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
