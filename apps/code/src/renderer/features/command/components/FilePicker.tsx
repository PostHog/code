import { FileIcon } from "@components/ui/FileIcon";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { pathToFileItem, searchFiles, useRepoFiles } from "@hooks/useRepoFiles";
import { Popover, Text } from "@radix-ui/themes";
import { useCallback, useMemo, useState } from "react";
import { Command } from "./Command";
import "./FilePicker.css";

interface FilePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string;
  repoPath: string | undefined;
}

export function FilePicker({
  open,
  onOpenChange,
  taskId,
  repoPath,
}: FilePickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const openFileInSplit = usePanelLayoutStore((state) => state.openFileInSplit);
  const recentFiles = usePanelLayoutStore(
    (state) => state.taskLayouts[taskId]?.recentFiles ?? [],
  );

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      onOpenChange(isOpen);
      if (!isOpen) {
        setSearchQuery("");
      }
    },
    [onOpenChange],
  );

  const { files: fileItems, fzf } = useRepoFiles(repoPath, open);

  const displayedFiles = useMemo(() => {
    if (!searchQuery.trim() && recentFiles.length > 0) {
      return recentFiles.map(pathToFileItem);
    }
    return searchFiles(fzf, fileItems, searchQuery);
  }, [fzf, fileItems, searchQuery, recentFiles]);

  const resultsKey = useMemo(
    () => displayedFiles.map((f) => f.path).join(","),
    [displayedFiles],
  );

  const handleSelect = useCallback(
    (filePath: string) => {
      openFileInSplit(taskId, filePath, false);
      handleOpenChange(false);
    },
    [openFileInSplit, taskId, handleOpenChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger>
        <div
          style={{
            left: "50%",
          }}
          className="pointer-events-none fixed top-[60px] h-[1px] w-[1px] opacity-0"
        />
      </Popover.Trigger>
      <Popover.Content
        className="file-picker-popover p-0"
        maxWidth="640px"
        side="bottom"
        align="center"
        sideOffset={0}
        onInteractOutside={() => handleOpenChange(false)}
      >
        <Command.Root shouldFilter={false} label="File picker" key={resultsKey}>
          <Command.Input
            placeholder="Search files by name"
            autoFocus={true}
            value={searchQuery}
            onValueChange={setSearchQuery}
          />

          <Command.List>
            <Command.Empty>No files found.</Command.Empty>

            {displayedFiles.map((file) => (
              <Command.Item
                key={file.path}
                value={file.path}
                onSelect={() => handleSelect(file.path)}
              >
                <FileIcon filename={file.name} size={14} />
                <Text ml="2" className="text-[13px]">
                  {file.name}
                </Text>
                {file.dir && (
                  <Text color="gray" ml="2" className="text-[13px]">
                    {file.dir}
                  </Text>
                )}
              </Command.Item>
            ))}
          </Command.List>
        </Command.Root>
      </Popover.Content>
    </Popover.Root>
  );
}
