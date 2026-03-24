import { FileIcon } from "@components/ui/FileIcon";
import { Tooltip } from "@components/ui/Tooltip";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { getStatusIndicator } from "@features/task-detail/components/changesFileUtils";
import { getRowPaddingStyle } from "@features/task-detail/components/changesRowStyles";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { ChangedFile } from "@shared/types";

interface ChangesCloudFileRowProps {
  file: ChangedFile;
  taskId: string;
  isActive: boolean;
  paddingLeft?: number;
  showTreeSpacer?: boolean;
}

export function ChangesCloudFileRow({
  file,
  taskId,
  isActive,
  paddingLeft,
  showTreeSpacer,
}: ChangesCloudFileRowProps) {
  const openCloudDiffByMode = usePanelLayoutStore(
    (state) => state.openCloudDiffByMode,
  );
  const fileName = file.path.split("/").pop() || file.path;
  const indicator = getStatusIndicator(file.status);
  const hasLineStats =
    file.linesAdded !== undefined || file.linesRemoved !== undefined;

  const handleClick = () => {
    openCloudDiffByMode(taskId, file.path, file.status);
  };

  const handleDoubleClick = () => {
    openCloudDiffByMode(taskId, file.path, file.status, false);
  };

  return (
    <Tooltip
      content={`${file.path} - ${indicator.fullLabel}`}
      side="top"
      delayDuration={500}
    >
      <Flex
        align="center"
        gap="1"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        className={
          isActive
            ? "h-6 cursor-pointer overflow-hidden whitespace-nowrap border-accent-8 border-y bg-accent-4 pr-2 pl-[var(--changes-row-padding)]"
            : "h-6 cursor-pointer overflow-hidden whitespace-nowrap border-transparent border-y pr-2 pl-[var(--changes-row-padding)] hover:bg-gray-3"
        }
        style={getRowPaddingStyle(paddingLeft ?? 8)}
      >
        {showTreeSpacer && (
          <Box className="flex h-4 w-4 shrink-0 items-center justify-center" />
        )}
        <FileIcon filename={fileName} size={14} />
        <Text size="1" className="ml-0.5 min-w-0 shrink select-none truncate">
          {fileName}
        </Text>
        <Text
          size="1"
          color="gray"
          className="ml-1 min-w-0 flex-1 select-none truncate"
        >
          {file.originalPath
            ? `${file.originalPath} → ${file.path}`
            : file.path}
        </Text>

        {hasLineStats && (
          <Flex
            align="center"
            gap="1"
            className="shrink-0 font-mono text-[10px]"
          >
            {(file.linesAdded ?? 0) > 0 && (
              <Text className="text-green-9">+{file.linesAdded}</Text>
            )}
            {(file.linesRemoved ?? 0) > 0 && (
              <Text className="text-red-9">-{file.linesRemoved}</Text>
            )}
          </Flex>
        )}

        <Badge
          size="1"
          color={indicator.color}
          className="shrink-0 px-1 text-[10px]"
        >
          {indicator.label}
        </Badge>
      </Flex>
    </Tooltip>
  );
}
