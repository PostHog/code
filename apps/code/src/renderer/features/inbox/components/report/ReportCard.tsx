import { SignalReportPriorityBadge } from "@features/inbox/components/utils/SignalReportPriorityBadge";
import { SOURCE_PRODUCT_META } from "@features/inbox/components/utils/source-product-icons";
import { inboxStatusLabel } from "@features/inbox/utils/inboxSort";
import { ThumbsDownIcon } from "@phosphor-icons/react";
import { Tooltip } from "@radix-ui/themes";
import type { SignalReport, SignalReportStatus } from "@shared/types";
import { formatRelativeTimeShort } from "@utils/time";

interface ReportCardProps {
  report: SignalReport;
  isSelected: boolean;
  onClick: () => void;
  onDismiss: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  in_progress: "bg-[rgba(56,88,214,0.14)] text-[#3858d6]",
  candidate: "bg-[rgba(56,88,214,0.14)] text-[#3858d6]",
  potential: "bg-[rgba(56,88,214,0.14)] text-[#3858d6]",
  ready: "bg-[rgba(47,158,68,0.14)] text-[#2f9e44]",
  pending_input: "bg-[rgba(184,136,0,0.14)] text-[#b88800]",
  failed: "bg-[rgba(229,72,72,0.14)] text-[#d8503a]",
  suppressed: "bg-[rgba(107,110,122,0.12)] text-[#6b6e7a]",
  deleted: "bg-[rgba(107,110,122,0.12)] text-[#6b6e7a]",
};

function StatusPill({ status }: { status: SignalReportStatus }) {
  const label = inboxStatusLabel(status);
  const isResearching =
    status === "in_progress" ||
    status === "candidate" ||
    status === "potential";
  const isFailed = status === "failed";
  const isReady = status === "ready";
  const needsInput = status === "pending_input";

  let glyph = "";
  if (isReady) glyph = "\u2713";
  if (isFailed) glyph = "\u2715";
  if (needsInput) glyph = "?";

  const colorClass = STATUS_STYLES[status] ?? "bg-(--gray-3) text-(--gray-11)";

  return (
    <span
      className={`relative inline-flex items-center gap-1 rounded-[3px] px-1.5 py-px font-mono font-semibold text-[10px] uppercase tracking-wider ${colorClass}`}
    >
      {isResearching && (
        <span
          className="inline-block h-[5px] w-[5px] rounded-full"
          style={{
            backgroundColor: "currentColor",
            animation: "ph-pulse 1.6s ease-in-out infinite",
          }}
        />
      )}
      {glyph && <span className="font-bold text-[10px]">{glyph}</span>}
      <span>{label}</span>
    </span>
  );
}

/** Signal source pills. */
function SignalStrip({ sourceProducts }: { sourceProducts?: string[] }) {
  if (!sourceProducts || sourceProducts.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {sourceProducts.slice(0, 3).map((sp) => {
        const meta = SOURCE_PRODUCT_META[sp];
        if (!meta) return null;
        return (
          <span
            key={sp}
            className="inline-flex items-center gap-1 rounded-full border border-(--gray-5) bg-(--color-surface-raised) px-1.5 py-px text-(--gray-11) text-[10.5px]"
          >
            <span
              className="inline-block h-[5px] w-[5px] rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}

export function ReportCard({
  report,
  isSelected,
  onClick,
  onDismiss,
}: ReportCardProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: card with complex inner layout, not a simple button
    <div
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`group relative cursor-pointer rounded-md border p-3 sm:p-3.5 ${
        isSelected
          ? "border-(--color-accent) bg-(--gray-3)"
          : report.is_suggested_reviewer
            ? "border-amber-3 bg-amber-2 hover:border-amber-4 hover:bg-amber-3"
            : "border-(--gray-5) bg-(--color-surface-raised) hover:border-(--gray-6) hover:bg-(--gray-2)"
      }`}
    >
      {/* Top row: priority + ID + status + age + dismiss */}
      <div className="mb-1.5 flex items-center gap-2">
        <SignalReportPriorityBadge priority={report.priority} />
        <span className="font-mono text-(--gray-9) text-[10.5px]">
          {report.id.slice(0, 8)}
        </span>
        <StatusPill status={report.status} />
        <span className="font-mono text-(--gray-8) text-[10.5px]">
          {formatRelativeTimeShort(report.updated_at)} ago
        </span>
        <div className="flex-1" />
        <Tooltip content="Dismiss">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-(--gray-5) text-(--gray-9) opacity-0 hover:border-(--gray-6) hover:text-(--gray-12) focus:opacity-100 focus:outline-none focus:ring-1 focus:ring-amber-6 group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <ThumbsDownIcon size={12} />
          </button>
        </Tooltip>
      </div>

      {/* Title */}
      <div className="text-pretty font-medium text-(--gray-12) text-[13px] leading-[1.4]">
        {report.title ?? "Untitled signal"}
      </div>

      {/* Summary */}
      {report.summary && (
        <div className="mt-1 line-clamp-2 text-(--gray-10) text-[12.5px] leading-relaxed">
          {report.summary}
        </div>
      )}

      {/* Signal strip */}
      <SignalStrip sourceProducts={report.source_products} />

      {/* Progress bar for in_progress reports */}
      {report.status === "in_progress" && (
        <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-(--gray-4)">
          <span
            className="block h-full rounded-full"
            style={{
              width: "40%",
              background: "linear-gradient(90deg, #3858d6, #7c5cff)",
              animation: "shimmer 2s ease-in-out infinite",
            }}
          />
        </div>
      )}
    </div>
  );
}
