import type { SignalReportPriority } from "@shared/types";
import type { ReactNode } from "react";

/** Matches `ReportCard` status chip: `rounded-sm px-1 py-px font-mono text-[9px] uppercase tracking-wider` + 1px border */
const PRIORITY_CHIP_STYLE: Record<
  SignalReportPriority,
  { color: string; backgroundColor: string; borderColor: string }
> = {
  P0: {
    color: "var(--red-11)",
    backgroundColor: "var(--red-3)",
    borderColor: "var(--red-6)",
  },
  P1: {
    color: "var(--orange-11)",
    backgroundColor: "var(--orange-3)",
    borderColor: "var(--orange-6)",
  },
  P2: {
    color: "var(--amber-11)",
    backgroundColor: "var(--amber-3)",
    borderColor: "var(--amber-6)",
  },
  P3: {
    color: "var(--gray-11)",
    backgroundColor: "var(--gray-3)",
    borderColor: "var(--gray-6)",
  },
  P4: {
    color: "var(--gray-11)",
    backgroundColor: "var(--gray-3)",
    borderColor: "var(--gray-6)",
  },
};

interface SignalReportPriorityBadgeProps {
  priority: SignalReportPriority | null | undefined;
}

export function SignalReportPriorityBadge({
  priority,
}: SignalReportPriorityBadgeProps): ReactNode {
  if (priority == null) {
    return null;
  }

  const s = PRIORITY_CHIP_STYLE[priority];

  return (
    <span
      className="shrink-0 rounded-sm px-1 py-px font-mono text-[9px] uppercase tracking-wider"
      style={{
        color: s.color,
        backgroundColor: s.backgroundColor,
        border: `1px solid ${s.borderColor}`,
      }}
      title="Actionability priority from research"
    >
      {priority}
    </span>
  );
}
