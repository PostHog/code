import type { SignalReportActionability } from "@shared/types";
import type { ReactNode } from "react";

const ACTIONABILITY_CHIP_STYLE: Record<
  SignalReportActionability,
  { color: string; backgroundColor: string; borderColor: string; label: string }
> = {
  immediately_actionable: {
    color: "var(--green-11)",
    backgroundColor: "var(--green-3)",
    borderColor: "var(--green-6)",
    label: "Actionable",
  },
  requires_human_input: {
    color: "var(--amber-11)",
    backgroundColor: "var(--amber-3)",
    borderColor: "var(--amber-6)",
    label: "Needs input",
  },
  not_actionable: {
    color: "var(--gray-11)",
    backgroundColor: "var(--gray-3)",
    borderColor: "var(--gray-6)",
    label: "Not actionable",
  },
};

interface SignalReportActionabilityBadgeProps {
  actionability: SignalReportActionability | null | undefined;
  /** When true, prefix the label with "Researched ·" to signal that research is complete. */
  researched?: boolean;
}

export function SignalReportActionabilityBadge({
  actionability,
  researched,
}: SignalReportActionabilityBadgeProps): ReactNode {
  if (actionability == null) {
    return null;
  }

  const s = ACTIONABILITY_CHIP_STYLE[actionability];
  if (!s) {
    return null;
  }

  return (
    <span
      className="shrink-0 rounded-sm px-1 py-px text-[9px] uppercase tracking-wider"
      style={{
        color: s.color,
        backgroundColor: s.backgroundColor,
        border: `1px solid ${s.borderColor}`,
      }}
      title="Actionability assessment from research"
    >
      {researched ? `Researched · ${s.label}` : s.label}
    </span>
  );
}
