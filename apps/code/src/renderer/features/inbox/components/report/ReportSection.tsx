import type { SignalReport } from "@shared/types";
import type { ReportSectionKey } from "../../utils/inboxItemClassification";
import { REPORT_SECTION_META } from "../../utils/inboxItemClassification";
import { ReportCard } from "./ReportCard";

interface ReportSectionProps {
  sectionKey: ReportSectionKey;
  reports: SignalReport[];
  selectedId: string | null;
  onCardClick: (id: string) => void;
  onDismiss: (id: string) => void;
}

const SECTION_ICONS: Record<
  ReportSectionKey,
  { icon: string; bg: string; color: string }
> = {
  researching: {
    icon: "\u25D0",
    bg: "rgba(56, 88, 214, 0.12)",
    color: "#3858d6",
  },
  "needs-input": {
    icon: "!",
    bg: "rgba(184, 136, 0, 0.12)",
    color: "#b88800",
  },
  ready: {
    icon: "\u2713",
    bg: "rgba(47, 158, 68, 0.12)",
    color: "#2f9e44",
  },
  failed: {
    icon: "\u2715",
    bg: "rgba(229, 72, 72, 0.12)",
    color: "#d8503a",
  },
  "non-actionable": {
    icon: "\u25C7",
    bg: "rgba(107, 110, 122, 0.14)",
    color: "#6b6e7a",
  },
};

export function ReportSection({
  sectionKey,
  reports,
  selectedId,
  onCardClick,
  onDismiss,
}: ReportSectionProps) {
  const meta = REPORT_SECTION_META[sectionKey];
  const iconMeta = SECTION_ICONS[sectionKey];

  return (
    <div className="mt-4 first:mt-0">
      {/* Section header */}
      <div className="mb-1 px-2 sm:px-0">
        <div className="flex items-center gap-2.5 py-1">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-[5px] font-bold text-[12px]"
            style={{ background: iconMeta.bg, color: iconMeta.color }}
          >
            {iconMeta.icon}
          </div>
          <h3 className="font-semibold text-(--gray-12) text-[14px]">
            {meta.title}
          </h3>
          <span className="rounded-full bg-(--gray-3) px-1.5 py-0.5 font-mono text-(--gray-9) text-[10.5px]">
            {reports.length}
          </span>
        </div>
        <p className="pl-[34px] font-mono text-(--gray-9) text-[11.5px]">
          {meta.blurb}
        </p>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 px-2 sm:px-0">
        {reports.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            isSelected={selectedId === report.id}
            onClick={() => onCardClick(report.id)}
            onDismiss={() => onDismiss(report.id)}
          />
        ))}
      </div>
    </div>
  );
}
