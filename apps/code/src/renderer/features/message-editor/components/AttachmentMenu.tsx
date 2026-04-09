import "./AttachmentMenu.css";
import { File, GithubLogo, Paperclip } from "@phosphor-icons/react";
import { IconButton, Popover } from "@radix-ui/themes";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { toast } from "@renderer/utils/toast";
import { useQuery } from "@tanstack/react-query";
import { getFileName } from "@utils/path";
import { useRef, useState } from "react";
import type { FileAttachment, MentionChip } from "../utils/content";
import { persistBrowserFile } from "../utils/persistFile";
import { IssuePicker } from "./IssuePicker";

type View = "menu" | "issues";

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
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          const filePath = (file as globalThis.File & { path?: string }).path;
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

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setView("menu");
    }
  };

  const handleAddFile = async () => {
    setOpen(false);

    try {
      const filePaths = await trpcClient.os.selectFiles.query();
      if (filePaths.length > 0) {
        for (const filePath of filePaths) {
          onAddAttachment({ id: filePath, label: getFileName(filePath) });
        }
      }
      return;
    } catch {
      // Fall back to the input element for non-Electron environments.
    }

    fileInputRef.current?.click();
  };

  const handleIssueSelect = (chip: MentionChip) => {
    onInsertChip(chip);
    setOpen(false);
    setView("menu");
  };

  const issueButton = (
    <button
      type="button"
      disabled={!!issueDisabledReason}
      onClick={() => setView("issues")}
      className="attachment-menu-item"
    >
      <span className="attachment-menu-item-icon">
        <GithubLogo size={14} weight="bold" />
      </span>
      <span>Add issue</span>
    </button>
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: "none" }}
      />
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            disabled={disabled}
            title={attachTooltip}
          >
            <Paperclip size={iconSize} weight="bold" />
          </IconButton>
        </Popover.Trigger>
        <Popover.Content side="top" align="start" style={{ padding: 0 }}>
          {view === "menu" ? (
            <div className="attachment-menu">
              <button
                type="button"
                onClick={handleAddFile}
                className="attachment-menu-item"
              >
                <span className="attachment-menu-item-icon">
                  <File size={14} weight="bold" />
                </span>
                <span>Add file</span>
              </button>
              {issueDisabledReason ? (
                <span title={issueDisabledReason}>{issueButton}</span>
              ) : (
                issueButton
              )}
            </div>
          ) : (
            <div className="issue-picker">
              <IssuePicker
                repoPath={repoPath ?? ""}
                onSelect={handleIssueSelect}
              />
            </div>
          )}
        </Popover.Content>
      </Popover.Root>
    </>
  );
}
