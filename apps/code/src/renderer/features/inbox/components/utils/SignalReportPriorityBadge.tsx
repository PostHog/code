import { Badge } from "@radix-ui/themes";
import type { SignalReportPriority } from "@shared/types";
import type { ReactNode } from "react";

type BadgeColor = "red" | "orange" | "amber" | "gray";

const PRIORITY_COLOR: Record<SignalReportPriority, BadgeColor> = {
  P0: "red",
  P1: "orange",
  P2: "amber",
  P3: "gray",
  P4: "gray",
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

  return (
    <Badge
      color={PRIORITY_COLOR[priority]}
      size="1"
      variant="surface"
      className="!py-0.5 !text-[9px] !leading-tight uppercase"
    >
      {priority}
    </Badge>
  );
}
