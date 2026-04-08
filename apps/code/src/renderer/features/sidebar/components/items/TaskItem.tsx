import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { Tooltip } from "@components/ui/Tooltip";
import type { WorkspaceMode } from "@main/services/workspace/schemas";
import {
  Archive,
  ArrowsClockwise,
  ArrowsSplit,
  BellRinging,
  Cloud as CloudIcon,
  Laptop as LaptopIcon,
  Pause,
  PushPin,
} from "@phosphor-icons/react";
import { isTerminalStatus, type TaskRunStatus } from "@shared/types";
import { selectIsFocusedOnWorktree, useFocusStore } from "@stores/focusStore";
import { formatRelativeTimeShort } from "@utils/time";
import { useCallback, useEffect, useRef, useState } from "react";
import { SidebarItem } from "../SidebarItem";

interface TaskItemProps {
  depth?: number;
  taskId: string;
  label: string;
  isActive: boolean;
  workspaceMode?: WorkspaceMode;
  worktreePath?: string;
  isGenerating?: boolean;
  isUnread?: boolean;
  isPinned?: boolean;
  isSuspended?: boolean;
  needsPermission?: boolean;
  taskRunStatus?: TaskRunStatus;
  timestamp?: number;
  isEditing?: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onArchive?: () => void;
  onTogglePin?: () => void;
  onEditSubmit?: (newTitle: string) => void;
  onEditCancel?: () => void;
}

interface TaskHoverToolbarProps {
  isPinned: boolean;
  onTogglePin?: () => void;
  onArchive?: () => void;
}

function TaskHoverToolbar({
  isPinned,
  onTogglePin,
  onArchive,
}: TaskHoverToolbarProps) {
  return (
    <span className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
      {onTogglePin && (
        <Tooltip content={isPinned ? "Unpin task" : "Pin task"} side="top">
          {/* biome-ignore lint/a11y/useSemanticElements: Cannot use button inside parent button (SidebarItem) */}
          <span
            role="button"
            tabIndex={0}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onTogglePin();
              }
            }}
          >
            <PushPin size={12} weight={isPinned ? "fill" : "regular"} />
          </span>
        </Tooltip>
      )}
      {onArchive && (
        <Tooltip content="Archive task" side="top">
          {/* biome-ignore lint/a11y/useSemanticElements: Cannot use button inside parent button (SidebarItem) */}
          <span
            role="button"
            tabIndex={0}
            className="flex h-5 w-5 cursor-pointer items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            onClick={(e) => {
              e.stopPropagation();
              onArchive();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onArchive();
              }
            }}
          >
            <Archive size={12} />
          </span>
        </Tooltip>
      )}
    </span>
  );
}

const ICON_SIZE = 12;
const INDENT_SIZE = 8;

function CloudStatusIcon({
  taskRunStatus,
}: {
  taskRunStatus?: TaskItemProps["taskRunStatus"];
}) {
  if (taskRunStatus === "queued" || taskRunStatus === "in_progress") {
    return (
      <Tooltip content="Cloud (running)" side="right">
        <span className="flex items-center justify-center">
          <CloudIcon size={ICON_SIZE} className="ph-pulse" />
        </span>
      </Tooltip>
    );
  }
  if (taskRunStatus === "completed") {
    return (
      <Tooltip content="Cloud (completed)" side="right">
        <span className="flex items-center justify-center">
          <CloudIcon size={ICON_SIZE} weight="fill" className="text-green-11" />
        </span>
      </Tooltip>
    );
  }
  if (taskRunStatus === "failed" || taskRunStatus === "cancelled") {
    const label =
      taskRunStatus === "cancelled" ? "Cloud (cancelled)" : "Cloud (failed)";
    return (
      <Tooltip content={label} side="right">
        <span className="flex items-center justify-center">
          <CloudIcon size={ICON_SIZE} weight="fill" className="text-red-11" />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content="Cloud" side="right">
      <span className="flex items-center justify-center">
        <CloudIcon size={ICON_SIZE} />
      </span>
    </Tooltip>
  );
}

export function TaskItem({
  depth = 0,
  taskId,
  label,
  isActive,
  workspaceMode,
  worktreePath,
  isSuspended = false,
  isGenerating,
  isUnread,
  isPinned = false,
  needsPermission = false,
  taskRunStatus,
  timestamp,
  isEditing = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onArchive,
  onTogglePin,
  onEditSubmit,
  onEditCancel,
}: TaskItemProps) {
  const isFocused = useFocusStore(
    selectIsFocusedOnWorktree(worktreePath ?? ""),
  );

  const isWorktreeTask = workspaceMode === "worktree";
  const isCloudTask = workspaceMode === "cloud";

  const isTerminalCloud = isCloudTask && isTerminalStatus(taskRunStatus);

  const icon = isSuspended ? (
    <Tooltip content="Suspended" side="right">
      <span className="flex items-center justify-center">
        <Pause size={ICON_SIZE} className="text-gray-9" />
      </span>
    </Tooltip>
  ) : needsPermission ? (
    <BellRinging size={ICON_SIZE} className="text-blue-11" />
  ) : isTerminalCloud ? (
    <CloudStatusIcon taskRunStatus={taskRunStatus} />
  ) : isGenerating ? (
    <DotsCircleSpinner size={ICON_SIZE} className="text-accent-11" />
  ) : isCloudTask ? (
    <CloudStatusIcon taskRunStatus={taskRunStatus} />
  ) : isUnread ? (
    <span className="flex items-center justify-center text-[8px] text-green-11">
      ■
    </span>
  ) : isPinned ? (
    <PushPin size={ICON_SIZE} className="text-accent-11" />
  ) : isWorktreeTask ? (
    isFocused ? (
      <Tooltip content="Worktree (syncing)" side="right">
        <span className="flex items-center justify-center">
          <ArrowsClockwise
            size={ICON_SIZE}
            weight="duotone"
            className="animate-sync-rotate text-blue-11"
          />
        </span>
      </Tooltip>
    ) : (
      <Tooltip content="Worktree" side="right">
        <span className="flex items-center justify-center">
          <ArrowsSplit
            size={ICON_SIZE}
            style={{ transform: "rotate(270deg)" }}
          />
        </span>
      </Tooltip>
    )
  ) : (
    <Tooltip content="Local" side="right">
      <span className="flex items-center justify-center">
        <LaptopIcon size={ICON_SIZE} />
      </span>
    </Tooltip>
  );

  const timestampNode = timestamp ? (
    <span className="shrink-0 text-[11px] text-gray-11 group-hover:hidden">
      {formatRelativeTimeShort(timestamp)}
    </span>
  ) : null;

  const toolbar =
    onArchive || onTogglePin ? (
      <TaskHoverToolbar
        isPinned={isPinned}
        onTogglePin={onTogglePin}
        onArchive={onArchive}
      />
    ) : null;

  const endContent =
    timestampNode || toolbar ? (
      <>
        {timestampNode}
        {toolbar}
      </>
    ) : null;

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("text/x-task-id", taskId);
      e.dataTransfer.effectAllowed = "copy";
    },
    [taskId],
  );

  if (isEditing) {
    return (
      <InlineEditInput
        depth={depth}
        icon={icon}
        label={label}
        isActive={isActive}
        onSubmit={(newTitle) => onEditSubmit?.(newTitle)}
        onCancel={() => onEditCancel?.()}
      />
    );
  }

  return (
    <SidebarItem
      depth={depth}
      icon={icon}
      label={label}
      isActive={isActive}
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      endContent={endContent}
    />
  );
}

function InlineEditInput({
  depth,
  icon,
  label,
  isActive,
  onSubmit,
  onCancel,
}: {
  depth: number;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  onSubmit: (newTitle: string) => void;
  onCancel: () => void;
}) {
  const [editValue, setEditValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }, []);

  const handleSubmit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== label) {
      onSubmit(trimmed);
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      className={`flex w-full items-start px-2 py-1.5 text-[13px]${isActive ? "bg-accent-4 text-gray-12" : ""}`}
      style={{
        paddingLeft: `${depth * INDENT_SIZE + 8 + (depth > 0 ? 4 : 0)}px`,
        gap: "4px",
      }}
    >
      {icon && (
        <span
          className={`flex shrink-0 items-center ${isActive ? "text-gray-11" : "text-gray-10"}`}
          style={{
            height: "18px",
            width: "18px",
            justifyContent: "center",
          }}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className="flex items-center" style={{ height: "18px" }}>
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleSubmit}
            className="min-w-0 flex-1 rounded-sm border border-accent-8 bg-gray-2 px-1 text-[13px] text-gray-12 outline-none"
            style={{ height: "18px" }}
          />
        </span>
      </span>
    </div>
  );
}
