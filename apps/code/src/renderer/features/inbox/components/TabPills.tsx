import type { InboxTab } from "@features/inbox/stores/inboxViewStore";

interface TabPillsProps {
  activeTab: InboxTab;
  prCount: number;
  reportCount: number;
  onTabChange: (tab: InboxTab) => void;
}

function CountChip({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={`ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] leading-none ${
        active
          ? "bg-amber-4/30 text-amber-12"
          : "bg-(--gray-3) text-(--gray-11)"
      }`}
    >
      {count}
    </span>
  );
}

export function TabPills({
  activeTab,
  prCount,
  reportCount,
  onTabChange,
}: TabPillsProps) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onTabChange("pull-requests")}
        className={`flex items-center rounded px-3 py-1.5 font-medium text-[13px] transition-none ${
          activeTab === "pull-requests"
            ? "bg-amber-2 text-amber-11"
            : "text-(--gray-11) hover:bg-(--gray-3)"
        }`}
      >
        Pull requests
        <CountChip count={prCount} active={activeTab === "pull-requests"} />
      </button>
      <button
        type="button"
        onClick={() => onTabChange("reports")}
        className={`flex items-center rounded px-3 py-1.5 font-medium text-[13px] transition-none ${
          activeTab === "reports"
            ? "bg-amber-2 text-amber-11"
            : "text-(--gray-11) hover:bg-(--gray-3)"
        }`}
      >
        Reports
        <CountChip count={reportCount} active={activeTab === "reports"} />
      </button>
    </div>
  );
}
