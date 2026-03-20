import { EnvelopeSimple, Plus } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface NewTaskItemProps {
  isActive: boolean;
  onClick: () => void;
}

export function NewTaskItem({ isActive, onClick }: NewTaskItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<Plus size={16} weight={isActive ? "bold" : "regular"} />}
      label="New task"
      isActive={isActive}
      onClick={onClick}
    />
  );
}

interface InboxItemProps {
  isActive: boolean;
  onClick: () => void;
  signalCount?: number;
  /** True while at least one report is `in_progress` (summary / judges running). */
  pipelineActive?: boolean;
}

function formatSignalCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export function InboxItem({
  isActive,
  onClick,
  signalCount,
  pipelineActive = false,
}: InboxItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<EnvelopeSimple size={16} weight={isActive ? "fill" : "regular"} />}
      label="Inbox"
      isActive={isActive}
      onClick={onClick}
      endContent={
        pipelineActive || (signalCount && signalCount > 0) ? (
          <span className="inline-flex items-center gap-1">
            {pipelineActive ? (
              <span
                className="relative flex h-2 w-2 shrink-0"
                title="Research in progress on at least one report"
              >
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-35"
                  style={{ backgroundColor: "var(--amber-9)" }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ backgroundColor: "var(--amber-9)" }}
                />
              </span>
            ) : null}
            {signalCount && signalCount > 0 ? (
              <span
                className="inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] text-gray-11 leading-none"
                style={{ height: "16px" }}
                title={`${signalCount} ready reports`}
              >
                {formatSignalCount(signalCount)}
              </span>
            ) : null}
          </span>
        ) : undefined
      }
    />
  );
}
