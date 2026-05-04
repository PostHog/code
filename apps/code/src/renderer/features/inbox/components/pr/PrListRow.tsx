import { usePrDetails } from "@features/git-interaction/hooks/usePrDetails";
import { parseGitHubPrReference } from "@features/inbox/components/utils/ReportImplementationPrLink";
import { SignalReportPriorityBadge } from "@features/inbox/components/utils/SignalReportPriorityBadge";
import { GitBranchIcon, ThumbsDownIcon } from "@phosphor-icons/react";
import { Tooltip } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { formatRelativeTimeShort } from "@utils/time";
import type { PrReadiness } from "../../utils/inboxItemClassification";

interface PrListRowProps {
  report: SignalReport;
  kind: PrReadiness;
  isSelected: boolean;
  onClick: () => void;
  onDismiss: () => void;
}

/**
 * Extract a one-line impact statement from the summary.
 * Takes the first sentence that starts with a quantitative signal
 * (number, percentage, "affects", etc.), or falls back to the last
 * sentence of the summary which often contains the user-impact line.
 */
function extractImpact(summary: string | null): string | null {
  if (!summary) return null;
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
  // Look for a sentence with quantitative language
  const quantitative = sentences.find((s) =>
    /^\d|%|affects|impact|users?|customers?|sessions?/i.test(s),
  );
  if (quantitative) return quantitative;
  // Fall back to the last sentence if there are multiple
  if (sentences.length > 2) return sentences[sentences.length - 1];
  return null;
}

export function PrListRow({
  report,
  kind,
  isSelected,
  onClick,
  onDismiss,
}: PrListRowProps) {
  const prUrl = report.implementation_pr_url ?? "";
  const { prNumber } = parseGitHubPrReference(prUrl);

  // Fetch real PR metadata (branch, diff stats) from GitHub
  const {
    meta: { additions, deletions, headRef },
  } = usePrDetails(prUrl || null);

  const isReady = kind === "ready";
  const isSuggested = report.is_suggested_reviewer;
  const impact = extractImpact(report.summary);
  const branchName = headRef ?? null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: card row with complex inner layout, not a simple button
    <div
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`group relative grid cursor-pointer gap-x-3 gap-y-1 rounded-md border p-3.5 ${
        isSelected
          ? "border-(--color-accent) bg-(--gray-3)"
          : isSuggested
            ? "border-amber-3 bg-amber-2 hover:border-amber-4 hover:bg-amber-3"
            : "border-(--gray-5) bg-(--color-surface-raised) hover:border-(--gray-6) hover:bg-(--gray-2)"
      }`}
      style={{
        gridTemplateColumns: "28px 1fr auto auto auto",
      }}
    >
      {/* Col 1: Priority chip */}
      <div className="flex items-start pt-0.5">
        <SignalReportPriorityBadge priority={report.priority} />
      </div>

      {/* Col 2: Title block */}
      <div className="min-w-0">
        {/* Title */}
        <div className="text-pretty font-semibold text-(--gray-12) text-[13.5px] leading-[1.4]">
          {report.title ?? "Untitled"}
        </div>

        {/* Summary */}
        {report.summary && (
          <div className="mt-1 line-clamp-2 text-pretty text-(--gray-10) text-[12px] leading-[1.5]">
            {report.summary}
          </div>
        )}

        {/* Meta strip */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-(--gray-9) text-[10.5px]">
          <span
            style={{ color: isReady ? "var(--green-9)" : "var(--amber-9)" }}
          >
            {isReady ? "\u25CF ready" : "\u25CF review"}
          </span>
          <span className="text-(--gray-6)">{"\u00B7"}</span>
          <span>{prNumber}</span>
          {branchName && (
            <>
              <span className="text-(--gray-6)">{"\u00B7"}</span>
              <span className="flex items-center gap-0.5">
                <GitBranchIcon size={10} />
                {branchName}
              </span>
            </>
          )}
          <span className="text-(--gray-6)">{"\u00B7"}</span>
          <span>
            {report.signal_count} signal
            {report.signal_count !== 1 ? "s" : ""}
          </span>
          <span className="text-(--gray-6)">{"\u00B7"}</span>
          <span>{formatRelativeTimeShort(report.updated_at)} ago</span>
        </div>

        {/* Impact line */}
        {impact && (
          <div className="mt-1.5 border-t border-t-(--gray-4) border-dashed pt-2 text-(--gray-10) text-[12px] leading-[1.5]">
            {impact}
          </div>
        )}
      </div>

      {/* Col 3: Diff stats */}
      {additions != null && deletions != null && (
        <div className="flex items-center gap-1.5 font-mono text-[11px]">
          <span className="text-green-9">+{additions}</span>
          <span className="text-red-9">&minus;{deletions}</span>
        </div>
      )}

      {/* Col 4: Review button — pill shape */}
      <div className="flex items-center">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="rounded-full bg-amber-3 px-3 py-1 font-semibold text-[12px] text-amber-11 hover:bg-amber-4 focus:outline-none focus:ring-1 focus:ring-amber-5"
        >
          Review
        </button>
      </div>

      {/* Col 5: Dismiss */}
      <Tooltip content="Dismiss">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="flex h-6 w-6 items-center justify-center self-center rounded-md border border-(--gray-5) text-(--gray-9) opacity-0 hover:border-(--gray-6) hover:text-(--gray-12) focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-amber-6 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <ThumbsDownIcon size={13} />
        </button>
      </Tooltip>
    </div>
  );
}
