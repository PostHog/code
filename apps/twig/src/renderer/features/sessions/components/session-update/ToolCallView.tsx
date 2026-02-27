import type { TwigToolKind } from "@features/sessions/types";
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  Brain,
  ChatCircle,
  FileText,
  Globe,
  type Icon,
  MagnifyingGlass,
  PencilSimple,
  Terminal,
  Trash,
  Wrench,
} from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { compactHomePath } from "@utils/path";
import { useState } from "react";
import {
  ExpandableIcon,
  ExpandedContentBox,
  getContentText,
  getFilename,
  StatusIndicators,
  ToolTitle,
  type ToolViewProps,
  useToolCallStatus,
} from "./toolCallUtils";

const kindIcons: Record<TwigToolKind, Icon> = {
  read: FileText,
  edit: PencilSimple,
  delete: Trash,
  move: ArrowsLeftRight,
  search: MagnifyingGlass,
  execute: Terminal,
  think: Brain,
  fetch: Globe,
  switch_mode: ArrowsClockwise,
  question: ChatCircle,
  other: Wrench,
};

export function ToolCallView({
  toolCall,
  turnCancelled,
  turnComplete,
  expanded = false,
}: ToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const { title, kind, status, locations, content } = toolCall;
  const { isLoading, isFailed, wasCancelled } = useToolCallStatus(
    status,
    turnCancelled,
    turnComplete,
  );
  const KindIcon = (kind && kindIcons[kind]) || Wrench;

  const filePath = kind === "read" && locations?.[0]?.path;
  const displayText = filePath
    ? `Read ${getFilename(filePath)}`
    : title
      ? compactHomePath(title)
      : undefined;

  const output = stripCodeFences(getContentText(content) ?? "");
  const hasOutput = output.trim().length > 0;
  const isExpandable = hasOutput;

  const handleClick = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Box
      className={`group py-0.5 ${isExpandable ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      <Flex gap="2">
        <Box className="shrink-0 pt-px">
          <ExpandableIcon
            icon={KindIcon}
            isLoading={isLoading}
            isExpandable={isExpandable}
            isExpanded={isExpanded}
          />
        </Box>
        <Flex align="center" gap="2" wrap="wrap">
          <ToolTitle>{displayText}</ToolTitle>
          <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
        </Flex>
      </Flex>

      {isExpanded && hasOutput && (
        <ExpandedContentBox>{output}</ExpandedContentBox>
      )}
    </Box>
  );
}

function stripCodeFences(text: string): string {
  return text.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "");
}
