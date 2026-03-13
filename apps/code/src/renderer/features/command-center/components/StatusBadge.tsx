import type { CellStatus } from "../hooks/useCommandCenterData";

const statusConfig: Record<CellStatus, { label: string; dotClass: string }> = {
  running: { label: "Running", dotClass: "bg-green-9 animate-pulse" },
  waiting: { label: "Waiting", dotClass: "bg-amber-9" },
  idle: { label: "Idle", dotClass: "bg-gray-8" },
  error: { label: "Error", dotClass: "bg-red-9" },
  completed: { label: "Completed", dotClass: "bg-blue-9" },
};

interface StatusBadgeProps {
  status: CellStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-3 px-1.5 py-0.5 font-mono text-[10px] text-gray-11">
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotClass}`}
      />
      {config.label}
    </span>
  );
}
