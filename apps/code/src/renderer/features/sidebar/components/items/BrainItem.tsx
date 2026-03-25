import { Brain } from "@phosphor-icons/react";
import { SidebarItem } from "../SidebarItem";

interface BrainItemProps {
  isActive: boolean;
  onClick: () => void;
}

export function BrainItem({ isActive, onClick }: BrainItemProps) {
  return (
    <SidebarItem
      depth={0}
      icon={<Brain size={16} weight={isActive ? "fill" : "regular"} />}
      label="Brain"
      isActive={isActive}
      onClick={onClick}
    />
  );
}
