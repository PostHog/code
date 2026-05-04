import type { SignalReport } from "@shared/types";
import type { PrReadiness } from "../../utils/inboxItemClassification";
import { PrListRow } from "./PrListRow";

interface PrListSectionProps {
  kind: PrReadiness;
  reports: SignalReport[];
  selectedId: string | null;
  onRowClick: (id: string) => void;
  onDismiss: (id: string) => void;
}

const SECTION_CONFIG: Record<
  PrReadiness,
  { title: string; icon: string; iconBg: string; iconColor: string }
> = {
  ready: {
    title: "Ready to merge",
    icon: "\u2713",
    iconBg: "rgba(47, 158, 68, 0.12)",
    iconColor: "#2f9e44",
  },
  review: {
    title: "Review before merging",
    icon: "\u25CB",
    iconBg: "rgba(184, 136, 0, 0.12)",
    iconColor: "#b88800",
  },
};

export function PrListSection({
  kind,
  reports,
  selectedId,
  onRowClick,
  onDismiss,
}: PrListSectionProps) {
  const config = SECTION_CONFIG[kind];

  return (
    <div className="mt-4 first:mt-0">
      {/* Section header */}
      <div className="flex items-center gap-2.5 px-2 pb-2 sm:px-0">
        <div
          className="flex h-6 w-6 items-center justify-center rounded-[5px] text-[12px]"
          style={{ background: config.iconBg, color: config.iconColor }}
        >
          {config.icon}
        </div>
        <h3 className="font-semibold text-(--gray-12) text-[14px]">
          {config.title}
        </h3>
        <span className="rounded-full bg-(--gray-3) px-1.5 py-0.5 font-mono text-(--gray-9) text-[10.5px]">
          {reports.length}
        </span>
      </div>

      {/* Rows */}
      <div className="flex flex-col gap-1.5">
        {reports.map((report) => (
          <PrListRow
            key={report.id}
            report={report}
            kind={kind}
            isSelected={selectedId === report.id}
            onClick={() => onRowClick(report.id)}
            onDismiss={() => onDismiss(report.id)}
          />
        ))}
      </div>
    </div>
  );
}
