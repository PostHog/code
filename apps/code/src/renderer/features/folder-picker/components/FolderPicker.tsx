import { useFolders } from "@features/folders/hooks/useFolders";
import {
  CaretDown,
  Folder as FolderIcon,
  FolderOpen,
  GitBranch,
} from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  MenuLabel,
} from "@posthog/quill";
import { trpcClient } from "@renderer/trpc";
import type { RefObject } from "react";

interface FolderPickerProps {
  value: string;
  onChange: (path: string) => void;
  placeholder?: string;
  size?: "1" | "2";
  anchor?: RefObject<HTMLElement | null>;
}

export function FolderPicker({
  value,
  onChange,
  placeholder = "Select folder...",
  anchor,
}: FolderPickerProps) {
  const {
    getRecentFolders,
    getFolderDisplayName,
    addFolder,
    updateLastAccessed,
    getFolderByPath,
  } = useFolders();

  const recentFolders = getRecentFolders();
  const displayValue = getFolderDisplayName(value);

  const handleSelect = async (path: string) => {
    onChange(path);
    const folder = getFolderByPath(path);
    if (folder) {
      updateLastAccessed(folder.id);
    }
  };

  const handleOpenFilePicker = async () => {
    const selectedPath = await trpcClient.os.selectDirectory.query();
    if (selectedPath) {
      await addFolder(selectedPath);
      onChange(selectedPath);
    }
  };

  if (recentFolders.length === 0) {
    return (
      <Button variant="outline" size="sm" onClick={handleOpenFilePicker}>
        <FolderIcon size={14} weight="regular" className="shrink-0" />
        <span className="max-w-[120px] truncate">
          {displayValue || placeholder}
        </span>
        <CaretDown size={10} weight="bold" className="text-muted-foreground" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" aria-label="Folder">
            <FolderIcon size={14} weight="regular" className="shrink-0" />
            <span className="max-w-[120px] truncate">
              {displayValue || placeholder}
            </span>
            <CaretDown
              size={10}
              weight="bold"
              className="text-muted-foreground"
            />
          </Button>
        }
      />
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        side="bottom"
        sideOffset={6}
        className="min-w-[200px]"
      >
        <MenuLabel>Recent</MenuLabel>

        {recentFolders.map((folder) => (
          <DropdownMenuItem
            key={folder.id}
            onClick={() => handleSelect(folder.path)}
          >
            <GitBranch size={12} />
            <span className="whitespace-nowrap">{folder.name}</span>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={handleOpenFilePicker}>
          <FolderOpen size={12} />
          <span className="whitespace-nowrap">Open folder...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
