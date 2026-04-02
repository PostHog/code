import { Tooltip } from "@components/ui/Tooltip";
import { EnvelopeSimple, Plus } from "@phosphor-icons/react";
import {
  formatHotkey,
  SHORTCUTS,
} from "@renderer/constants/keyboard-shortcuts";
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
}

function formatSignalCount(count: number): string {
  if (count > 99) return "99+";
  return String(count);
}

export function InboxItem({ isActive, onClick, signalCount }: InboxItemProps) {
  return (
    <Tooltip
      content="Open inbox"
      shortcut={formatHotkey(SHORTCUTS.INBOX)}
      side="right"
    >
      <div>
        <SidebarItem
          depth={0}
          icon={
            <EnvelopeSimple size={16} weight={isActive ? "fill" : "regular"} />
          }
          label="Inbox"
          isActive={isActive}
          onClick={onClick}
          endContent={
            signalCount && signalCount > 0 ? (
              <span
                className="inline-flex min-w-[16px] items-center justify-center rounded-full px-1 text-[11px] text-gray-11 leading-none"
                style={{ height: "16px" }}
                title={`${signalCount} ready reports`}
              >
                {formatSignalCount(signalCount)}
              </span>
            ) : undefined
          }
        />
      </div>
    </Tooltip>
  );
}
