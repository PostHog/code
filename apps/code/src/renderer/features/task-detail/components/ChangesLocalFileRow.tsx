import { FileIcon } from "@components/ui/FileIcon";
import { Tooltip } from "@components/ui/Tooltip";
import { useExternalApps } from "@features/external-apps/hooks/useExternalApps";
import { updateGitCacheFromSnapshot } from "@features/git-interaction/utils/updateGitCache";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import {
  getDiscardInfo,
  getStatusIndicator,
} from "@features/task-detail/components/changesFileUtils";
import { getRowPaddingStyle } from "@features/task-detail/components/changesRowStyles";
import {
  ArrowCounterClockwiseIcon,
  CodeIcon,
  CopyIcon,
  FilePlus,
} from "@phosphor-icons/react";
import {
  Badge,
  Box,
  DropdownMenu,
  Flex,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";
import { trpcClient } from "@renderer/trpc/client";
import type { ChangedFile } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { showMessageBox } from "@utils/dialog";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { useState } from "react";

interface ChangesLocalFileRowProps {
  file: ChangedFile;
  taskId: string;
  repoPath: string;
  isActive: boolean;
  mainRepoPath?: string;
  paddingLeft?: number;
  showTreeSpacer?: boolean;
}

export function ChangesLocalFileRow({
  file,
  taskId,
  repoPath,
  isActive,
  mainRepoPath,
  paddingLeft,
  showTreeSpacer,
}: ChangesLocalFileRowProps) {
  const openDiffByMode = usePanelLayoutStore((state) => state.openDiffByMode);
  const closeDiffTabsForFile = usePanelLayoutStore(
    (state) => state.closeDiffTabsForFile,
  );
  const queryClient = useQueryClient();
  const { detectedApps } = useExternalApps();
  const workspace = useWorkspace(taskId);

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  const isToolbarVisible = isHovered || isDropdownOpen;
  const fileName = file.path.split("/").pop() || file.path;
  const fullPath = `${repoPath}/${file.path}`;
  const indicator = getStatusIndicator(file.status);

  const handleClick = () => {
    openDiffByMode(taskId, file.path, file.status);
  };

  const handleDoubleClick = () => {
    openDiffByMode(taskId, file.path, file.status, false);
  };

  const workspaceContext = {
    workspace,
    mainRepoPath,
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const result = await trpcClient.contextMenu.showFileContextMenu.mutate({
      filePath: fullPath,
    });

    if (!result.action) return;

    if (result.action.type === "external-app") {
      await handleExternalAppAction(
        result.action.action,
        fullPath,
        fileName,
        workspaceContext,
      );
    }
  };

  const handleOpenWith = async (appId: string) => {
    await handleExternalAppAction(
      { type: "open-in-app", appId },
      fullPath,
      fileName,
      workspaceContext,
    );

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleCopyPath = async () => {
    await handleExternalAppAction({ type: "copy-path" }, fullPath, fileName);
  };

  const handleDiscard = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const { message, action } = getDiscardInfo(file, fileName);

    const dialogResult = await showMessageBox({
      type: "warning",
      title: "Discard changes",
      message,
      buttons: ["Cancel", action],
      defaultId: 0,
      cancelId: 0,
    });

    if (dialogResult.response !== 1) return;

    const discardResult = await trpcClient.git.discardFileChanges.mutate({
      directoryPath: repoPath,
      filePath: file.originalPath ?? file.path,
      fileStatus: file.status,
    });

    closeDiffTabsForFile(taskId, file.path);

    if (discardResult.state) {
      updateGitCacheFromSnapshot(queryClient, repoPath, discardResult.state);
    }
  };

  const hasLineStats =
    file.linesAdded !== undefined || file.linesRemoved !== undefined;

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
        onContextMenu={handleContextMenu}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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

        {hasLineStats && !isToolbarVisible && (
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

        {isToolbarVisible && (
          <Flex align="center" gap="1" className="shrink-0">
            <Tooltip content="Discard changes">
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                onClick={handleDiscard}
                className="mx-0.5 h-5 w-5 shrink-0 p-0"
              >
                <ArrowCounterClockwiseIcon size={12} />
              </IconButton>
            </Tooltip>

            <DropdownMenu.Root
              open={isDropdownOpen}
              onOpenChange={setIsDropdownOpen}
            >
              <Tooltip content="Open file">
                <DropdownMenu.Trigger>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    onClick={(e) => e.stopPropagation()}
                    className="h-5 w-5 shrink-0 p-0"
                  >
                    <FilePlus size={12} weight="regular" />
                  </IconButton>
                </DropdownMenu.Trigger>
              </Tooltip>
              <DropdownMenu.Content size="1" align="end">
                {detectedApps
                  .filter((app) => app.type !== "terminal")
                  .map((app) => (
                    <DropdownMenu.Item
                      key={app.id}
                      onSelect={() => handleOpenWith(app.id)}
                    >
                      <Flex align="center" gap="2">
                        {app.icon ? (
                          <img
                            src={app.icon}
                            width={16}
                            height={16}
                            alt=""
                            className="rounded-sm"
                          />
                        ) : (
                          <CodeIcon size={16} weight="regular" />
                        )}
                        <Text size="1">{app.name}</Text>
                      </Flex>
                    </DropdownMenu.Item>
                  ))}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onSelect={handleCopyPath}>
                  <Flex align="center" gap="2">
                    <CopyIcon size={16} weight="regular" />
                    <Text size="1">Copy Path</Text>
                  </Flex>
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
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
