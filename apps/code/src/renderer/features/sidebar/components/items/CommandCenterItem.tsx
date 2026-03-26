import { Lightning } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface CommandCenterItemProps {
  isActive: boolean;
  onClick: () => void;
  activeCount?: number;
}

function formatActiveCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export function CommandCenterItem({
  isActive,
  onClick,
  activeCount,
}: CommandCenterItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<Lightning size={16} weight={isActive ? "fill" : "regular"} />}
      label="ADHD Mode"
      isActive={isActive}
      onClick={onClick}
      endContent={
        activeCount && activeCount > 0 ? (
          <span
            className="inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[11px] text-gray-11 leading-none"
            style={{ height: "16px" }}
            title={`${activeCount} active`}
          >
            {formatActiveCount(activeCount)}
          </span>
        ) : undefined
      }
    />
  );
}
