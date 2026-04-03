import { FileIcon } from "@components/ui/FileIcon";
import { CaretRight, FolderIcon, FolderOpenIcon } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import type { ReactNode } from "react";

const TREE_ROW_ACTIVE_CLASS = "border-accent-8 border-y bg-accent-4";
const TREE_ROW_INACTIVE_CLASS = "border-transparent border-y hover:bg-gray-3";
const TREE_INDENT_PX = 12;
const CARET_COL_SIZE = 16;

interface TreeDirectoryRowProps {
  name: string;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
  isActive?: boolean;
}

export function TreeDirectoryRow({
  name,
  depth,
  isExpanded,
  onToggle,
  isActive = false,
}: TreeDirectoryRowProps) {
  return (
    <Flex
      align="center"
      gap="1"
      onClick={onToggle}
      className={isActive ? TREE_ROW_ACTIVE_CLASS : TREE_ROW_INACTIVE_CLASS}
      style={{
        paddingLeft: `${depth * TREE_INDENT_PX + 4}px`,
        paddingRight: "8px",
        height: "22px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <Box
        style={{
          width: `${CARET_COL_SIZE}px`,
          height: `${CARET_COL_SIZE}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <CaretRight
          size={10}
          weight="bold"
          color="var(--gray-10)"
          style={{
            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.1s ease",
          }}
        />
      </Box>
      {isExpanded ? (
        <FolderOpenIcon
          size={14}
          weight="fill"
          color="var(--accent-9)"
          style={{ flexShrink: 0 }}
        />
      ) : (
        <FolderIcon
          size={14}
          color="var(--accent-9)"
          style={{ flexShrink: 0 }}
        />
      )}
      <span
        className="select-none overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
        style={{ marginLeft: "4px" }}
      >
        {name}
      </span>
    </Flex>
  );
}

interface TreeFileRowProps {
  fileName: string;
  depth: number;
  isActive?: boolean;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  /** Extra content rendered after the filename (badges, buttons, etc.) */
  trailing?: ReactNode;
}

export function TreeFileRow({
  fileName,
  depth,
  isActive = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  trailing,
}: TreeFileRowProps) {
  return (
    <Flex
      align="center"
      gap="1"
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={isActive ? TREE_ROW_ACTIVE_CLASS : TREE_ROW_INACTIVE_CLASS}
      style={{
        paddingLeft: `${depth * TREE_INDENT_PX + 4}px`,
        paddingRight: "8px",
        height: "22px",
        cursor: "pointer",
      }}
    >
      {/* Spacer to align with folder caret column */}
      <Box
        style={{
          width: `${CARET_COL_SIZE}px`,
          height: `${CARET_COL_SIZE}px`,
          flexShrink: 0,
        }}
      />
      <FileIcon filename={fileName} size={14} />
      <span
        className="select-none overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
        style={{ marginLeft: "4px", minWidth: 0, flex: 1 }}
      >
        {fileName}
      </span>
      {trailing}
    </Flex>
  );
}
