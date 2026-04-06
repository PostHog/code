import {
  inboxStatusBgCss,
  inboxStatusBorderCss,
  inboxStatusLabel,
  inboxStatusTextCss,
} from "@features/inbox/utils/inboxSort";
import { Tooltip } from "@radix-ui/themes";
import type { SignalReportStatus } from "@shared/types";

const STATUS_TOOLTIPS: Record<string, string> = {
  ready: "Research is complete. You can create a task from this report.",
  pending_input:
    "This report needs human input in PostHog before it can proceed.",
  in_progress: "An AI agent is actively researching this report's signals.",
  candidate: "Queued for research. An agent will pick this up shortly.",
  potential:
    "Gathering signals. The report will be queued once enough signals accumulate.",
  failed: "Research failed. The report may be retried automatically.",
  suppressed: "This report has been dismissed.",
  deleted: "This report has been deleted.",
};

interface SignalReportStatusBadgeProps {
  status: SignalReportStatus;
}

export function SignalReportStatusBadge({
  status,
}: SignalReportStatusBadgeProps) {
  const label = inboxStatusLabel(status);
  const textColor = inboxStatusTextCss(status);
  const tooltip = STATUS_TOOLTIPS[status] ?? status;

  const bgColor = inboxStatusBgCss(status);
  const borderColor = inboxStatusBorderCss(status);

  return (
    <Tooltip content={tooltip}>
      <span
        className="shrink-0 cursor-help rounded-sm px-1 py-px text-[9px] uppercase tracking-wider"
        style={{
          color: textColor,
          backgroundColor: bgColor,
          border: `1px solid ${borderColor}`,
        }}
      >
        {label}
      </span>
    </Tooltip>
  );
}
