import { File, GithubLogo, Paperclip } from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@posthog/quill";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { toast } from "@renderer/utils/toast";
import { useQuery } from "@tanstack/react-query";
import { getFilePath } from "@utils/getFilePath";
import { useRef, useState } from "react";
import type { FileAttachment, MentionChip } from "../utils/content";
import { persistBrowserFile } from "../utils/persistFile";
import { IssuePicker } from "./IssuePicker";

interface AttachmentMenuProps {
  disabled?: boolean;
  repoPath?: string | null;
  onAddAttachment: (attachment: FileAttachment) => void;
  onAttachFiles?: (files: File[]) => void;
  onInsertChip: (chip: MentionChip) => void;
  iconSize?: number;
  attachTooltip?: string;
}

function getIssueDisabledReason(
  ghStatus: { installed: boolean; authenticated: boolean } | undefined,
  repoPath: string | null | undefined,
): string | null {
  if (!repoPath) return "Select a repository folder first.";
  if (!ghStatus) return "Checking GitHub CLI status...";
  if (!ghStatus.installed) return "Install GitHub CLI: `brew install gh`";
  if (!ghStatus.authenticated)
    return "Authenticate GitHub CLI with `gh auth login`";
  return null;
}

export function AttachmentMenu({
  disabled = false,
  repoPath,
  onAddAttachment,
  onAttachFiles,
  onInsertChip,
  iconSize = 14,
  attachTooltip = "Attach",
}: AttachmentMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paperclipRef = useRef<HTMLButtonElement>(null);

  const trpc = useTRPC();
  const { data: ghStatus } = useQuery(
    trpc.git.getGhStatus.queryOptions(undefined, {
      staleTime: 60_000,
    }),
  );

  const issueDisabledReason = getIssueDisabledReason(ghStatus, repoPath);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (files.length === 0) {
      return;
    }

    try {
      const attachments = await Promise.all(
        files.map(async (file) => {
          const filePath = getFilePath(file);
          if (filePath) {
            return { id: filePath, label: file.name } satisfies FileAttachment;
          }

          return await persistBrowserFile(file);
        }),
      );

      for (const attachment of attachments) {
        if (attachment) {
          onAddAttachment(attachment);
        }
      }

      onAttachFiles?.(files);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to attach selected files from this picker",
      );
    }
  };

  const handleAddFile = async () => {
    setMenuOpen(false);

    try {
      const filePaths = await trpcClient.os.selectFiles.query();
      if (filePaths.length > 0) {
        for (const filePath of filePaths) {
          onAddAttachment({
            id: filePath,
            label: filePath.split("/").pop() ?? filePath,
          });
        }
      }
      return;
    } catch {
      // Fall back to the input element for non-Electron environments.
    }

    fileInputRef.current?.click();
  };

  const handleOpenIssuePicker = () => {
    setMenuOpen(false);
    setIssuePickerOpen(true);
  };

  const handleIssueSelect = (chip: MentionChip) => {
    onInsertChip(chip);
    setIssuePickerOpen(false);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          render={
            <Button
              ref={paperclipRef}
              type="button"
              variant="default"
              size="icon-sm"
              disabled={disabled}
              aria-label={attachTooltip}
              title={attachTooltip}
            >
              <Paperclip size={iconSize} weight="bold" />
            </Button>
          }
        />
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={6}
          className="min-w-[180px]"
        >
          <DropdownMenuItem onClick={handleAddFile}>
            <File size={14} weight="bold" />
            Add file
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!!issueDisabledReason}
            onClick={handleOpenIssuePicker}
            title={issueDisabledReason ?? undefined}
          >
            <GithubLogo size={14} weight="bold" />
            Add issue
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <IssuePicker
        repoPath={repoPath ?? ""}
        open={issuePickerOpen}
        onOpenChange={setIssuePickerOpen}
        onSelect={handleIssueSelect}
        anchor={paperclipRef}
      />
    </>
  );
}
