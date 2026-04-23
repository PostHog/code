import { Badge } from "@components/ui/Badge";
import type { SignalReportActionability } from "@shared/types";
import type { ReactNode } from "react";

const ACTIONABILITY_STYLE: Record<
  SignalReportActionability,
  { color: "green" | "amber" | "gray"; label: string }
> = {
  immediately_actionable: { color: "green", label: "Actionable" },
  requires_human_input: { color: "amber", label: "Needs input" },
  not_actionable: { color: "gray", label: "Not actionable" },
};

interface SignalReportActionabilityBadgeProps {
  actionability: SignalReportActionability | null | undefined;
}

export function SignalReportActionabilityBadge({
  actionability,
}: SignalReportActionabilityBadgeProps): ReactNode {
  if (actionability == null) {
    return null;
  }

  const s = ACTIONABILITY_STYLE[actionability];
  if (!s) {
    return null;
  }

  return <Badge color={s.color}>{s.label}</Badge>;
}
