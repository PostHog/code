import { ModelSelector } from "@features/sessions/components/ModelSelector";
import { Flex } from "@radix-ui/themes";
import type { FileAttachment, MentionChip } from "../utils/content";
import { AttachmentMenu } from "./AttachmentMenu";
import { ContextUsageIndicator } from "./ContextUsageIndicator";

interface EditorToolbarProps {
  disabled?: boolean;
  taskId?: string;
  adapter?: "claude" | "codex";
  repoPath?: string | null;
  onAddAttachment: (attachment: FileAttachment) => void;
  onAttachFiles?: (files: File[]) => void;
  onInsertChip: (chip: MentionChip) => void;
  attachTooltip?: string;
  iconSize?: number;
  hideSelectors?: boolean;
}

export function EditorToolbar({
  disabled = false,
  taskId,
  adapter,
  repoPath,
  onAddAttachment,
  onAttachFiles,
  onInsertChip,
  attachTooltip = "Attach",
  iconSize = 14,
  hideSelectors = false,
}: EditorToolbarProps) {
  return (
    <Flex align="center" gap="1">
      <AttachmentMenu
        disabled={disabled}
        repoPath={repoPath}
        onAddAttachment={onAddAttachment}
        onAttachFiles={onAttachFiles}
        onInsertChip={onInsertChip}
        iconSize={iconSize}
        attachTooltip={attachTooltip}
      />
      {!hideSelectors && (
        <ModelSelector taskId={taskId} adapter={adapter} disabled={disabled} />
      )}
      <ContextUsageIndicator taskId={taskId} />
    </Flex>
  );
}
