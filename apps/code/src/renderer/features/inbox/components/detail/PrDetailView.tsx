import { parseGitHubPrReference } from "@features/inbox/components/utils/ReportImplementationPrLink";
import { SignalReportPriorityBadge } from "@features/inbox/components/utils/SignalReportPriorityBadge";
import { SignalReportSummaryMarkdown } from "@features/inbox/components/utils/SignalReportSummaryMarkdown";
import {
  useInboxReportArtefacts,
  useInboxReportSignals,
} from "@features/inbox/hooks/useInboxReports";
import { classifyPrReadiness } from "@features/inbox/utils/inboxItemClassification";
import {
  ArrowSquareOutIcon,
  ThumbsDownIcon,
  XIcon,
} from "@phosphor-icons/react";
import { ScrollArea, Tooltip } from "@radix-ui/themes";
import type { SignalFindingArtefact, SignalReport } from "@shared/types";
import { useMemo } from "react";
import { MergeButton } from "../MergeButton";
import { SignalCard } from "./SignalCard";

interface PrDetailViewProps {
  report: SignalReport;
  onClose: () => void;
  onDismiss: () => void;
}

export function PrDetailView({
  report,
  onClose,
  onDismiss,
}: PrDetailViewProps) {
  const prUrl = report.implementation_pr_url ?? "";
  const { prNumber } = parseGitHubPrReference(prUrl);
  const kind = classifyPrReadiness(report);

  const statusText =
    kind === "ready" ? "Ready to merge" : "Review before merging";
  const statusColor = kind === "ready" ? "text-green-10" : "text-amber-10";

  // Signals
  const signalsQuery = useInboxReportSignals(report.id, { enabled: true });
  const signals = signalsQuery.data?.signals ?? [];

  // Artefacts (for signal findings)
  const artefactsQuery = useInboxReportArtefacts(report.id, { enabled: true });
  const signalFindings = useMemo(() => {
    const map = new Map<string, SignalFindingArtefact["content"]>();
    for (const a of artefactsQuery.data?.results ?? []) {
      if (a.type === "signal_finding") {
        const finding = a as SignalFindingArtefact;
        map.set(finding.content.signal_id, finding.content);
      }
    }
    return map;
  }, [artefactsQuery.data]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-b-(--gray-5) px-3 py-2.5 sm:px-4 sm:py-3">
        <SignalReportPriorityBadge priority={report.priority} />
        <span className="font-mono text-(--gray-9) text-[12px]">
          {prNumber}
        </span>
        <span className="hidden text-(--gray-6) sm:inline">{"\u00B7"}</span>
        <span
          className={`hidden font-medium text-[12px] sm:inline ${statusColor}`}
        >
          {statusText}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-(--gray-9) hover:bg-(--gray-3) hover:text-(--gray-12) focus:outline-none focus:ring-1 focus:ring-amber-6"
          aria-label="Close detail panel"
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Action row — wraps on narrow panels */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-b-(--gray-5) px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
        <MergeButton
          size="lg"
          onMerge={() => {}}
          onMergeBehindFlag={() => {}}
        />

        {prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 rounded-md px-2 py-1 text-(--gray-11) text-[12px] hover:bg-(--gray-3) hover:text-(--gray-12)"
          >
            Open in GitHub
            <ArrowSquareOutIcon size={12} />
          </a>
        )}

        <div className="flex-1" />

        <Tooltip content="Dismiss">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-md p-1 text-(--gray-9) hover:bg-(--gray-3) hover:text-(--gray-12)"
          >
            <ThumbsDownIcon size={14} />
          </button>
        </Tooltip>
      </div>

      {/* Body */}
      <ScrollArea type="auto" scrollbars="vertical" className="flex-1">
        <div className="px-3 py-3 sm:px-4 sm:py-4">
          {/* Title */}
          <h2 className="mb-2 font-semibold text-(--gray-12) text-[15px]">
            {report.title ?? "Untitled"}
          </h2>

          {/* Summary */}
          <SignalReportSummaryMarkdown
            content={report.summary}
            fallback="No summary available."
            variant="detail"
          />

          {/* Evidence / Signals */}
          {signals.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-medium text-(--gray-12) text-[13px]">
                Evidence ({signals.length})
              </h3>
              <div className="flex flex-col gap-2">
                {signals.map((signal) => (
                  <SignalCard
                    key={signal.signal_id}
                    signal={signal}
                    finding={signalFindings.get(signal.signal_id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
