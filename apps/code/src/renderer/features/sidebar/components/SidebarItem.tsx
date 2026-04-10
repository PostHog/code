import { Button, type ButtonProps, cn } from "@posthog/quill-primitives";
import type { SidebarItemAction } from "../types";

const INDENT_SIZE = 8;

interface SidebarItemProps {
  depth: number;
  icon?: React.ReactNode;
  label: string;
  subtitle?: React.ReactNode;
  isActive?: boolean;
  isDimmed?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  action?: SidebarItemAction;
  endContent?: React.ReactNode;
  variant?: ButtonProps["variant"];
}

export function SidebarItem({
  depth,
  icon,
  label,
  subtitle,
  isActive,
  draggable,
  onDragStart,
  onClick,
  onDoubleClick,
  onContextMenu,
  endContent,
  variant = "default",
}: SidebarItemProps) {
  return (
    <Button
      type="button"
      variant={variant}
      className={cn(
        "group focus-visible:-outline-offset-2 flex w-full text-left transition-colors focus-visible:outline-2 focus-visible:outline-accent-8",
        variant === "primary" && "data-active:opacity-50",
      )}
      data-active={isActive || undefined}
      draggable={draggable}
      onDragStart={onDragStart}
      style={{
        paddingLeft: `${depth * INDENT_SIZE + 8 + (depth > 0 ? 4 : 0)}px`,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      {icon ? <span className="flex shrink-0 items-center">{icon}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <span className="flex items-center gap-1" style={{ height: "18px" }}>
          <span
            className={`min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap`}
          >
            {label}
          </span>
          {endContent}
        </span>
        {subtitle && (
          <span className="overflow-hidden text-ellipsis whitespace-nowrap text-gray-10 group-data-active:text-gray-11">
            {subtitle}
          </span>
        )}
      </span>
    </Button>
  );
}
