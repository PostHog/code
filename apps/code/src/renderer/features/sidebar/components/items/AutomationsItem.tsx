import { ClockCounterClockwise } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface AutomationsItemProps {
  isActive: boolean;
  onClick: () => void;
  activeCount?: number;
}

export function AutomationsItem({
  isActive,
  onClick,
  activeCount = 0,
}: AutomationsItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={
        <ClockCounterClockwise
          size={16}
          weight={isActive ? "fill" : "regular"}
        />
      }
      label="Automations"
      isActive={isActive}
      onClick={onClick}
      endContent={
        activeCount > 0 ? (
          <span
            className="inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] text-gray-11 leading-none"
            style={{ height: "16px" }}
            title={`${activeCount} enabled automations`}
          >
            {activeCount > 99 ? "99+" : String(activeCount)}
          </span>
        ) : undefined
      }
    />
  );
}
