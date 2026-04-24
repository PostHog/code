import { FileIcon } from "@components/ui/FileIcon";
import { GitDialog } from "@features/git-interaction/components/GitInteractionDialogs";
import {
  getStatusIndicator,
  type StatusIndicator,
} from "@features/git-interaction/utils/gitStatusUtils";
import { Warning } from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { HandoffChangedFile } from "../stores/handoffDialogStore";

interface DirtyTreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  changedFiles: HandoffChangedFile[];
  onCommitAndContinue: () => void;
}

function FileLineStats({ file }: { file: HandoffChangedFile }) {
  const hasStats =
    file.linesAdded !== undefined || file.linesRemoved !== undefined;
  if (!hasStats) return null;

  return (
    <Flex
      align="center"
      gap="1"
      className="text-[10px] leading-none"
      style={{ flexShrink: 0, fontFamily: "monospace" }}
    >
      {(file.linesAdded ?? 0) > 0 && (
        <Text style={{ color: "var(--green-9)" }}>+{file.linesAdded}</Text>
      )}
      {(file.linesRemoved ?? 0) > 0 && (
        <Text style={{ color: "var(--red-9)" }}>-{file.linesRemoved}</Text>
      )}
    </Flex>
  );
}

function StatusBadge({ indicator }: { indicator: StatusIndicator }) {
  return (
    <Badge
      size="1"
      color={indicator.color}
      className="text-[10px]"
      style={{ flexShrink: 0, padding: "0 4px" }}
    >
      {indicator.label}
    </Badge>
  );
}

export function DirtyTreeDialog({
  open,
  onOpenChange,
  changedFiles,
  onCommitAndContinue,
}: DirtyTreeDialogProps) {
  return (
    <GitDialog
      open={open}
      onOpenChange={onOpenChange}
      icon={<Warning size={14} weight="fill" color="var(--amber-9)" />}
      title="Uncommitted changes"
      error={null}
      buttonLabel="Commit and continue"
      isSubmitting={false}
      onSubmit={onCommitAndContinue}
    >
      <Flex direction="column" gap="2">
        <Text color="gray" className="text-[13px] leading-5">
          The following local files have uncommitted changes that would be
          overwritten by the handoff. Commit them to continue.
        </Text>
        <Box
          style={{
            border: "1px solid var(--gray-6)",
            borderRadius: "var(--radius-2)",
            maxHeight: "200px",
            overflow: "auto",
          }}
        >
          {changedFiles.map((file) => {
            const fileName = file.path.split("/").pop() || file.path;
            const indicator = getStatusIndicator(file.status);
            return (
              <Flex
                key={file.path}
                align="center"
                gap="1"
                px="2"
                style={{ height: "28px" }}
              >
                <FileIcon filename={fileName} size={14} />
                <span
                  className="select-none overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                  style={{ marginLeft: "4px", minWidth: 0, flex: 1 }}
                >
                  {fileName}
                </span>
                <FileLineStats file={file} />
                <StatusBadge indicator={indicator} />
              </Flex>
            );
          })}
        </Box>
      </Flex>
    </GitDialog>
  );
}
