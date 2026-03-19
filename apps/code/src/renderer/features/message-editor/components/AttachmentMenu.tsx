import "./AttachmentMenu.css";
import { Tooltip } from "@components/ui/Tooltip";
import { File, GithubLogo, Paperclip } from "@phosphor-icons/react";
import { IconButton, Popover } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { FileAttachment, MentionChip } from "../utils/content";
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const fileArray = Array.from(files);
      for (const file of fileArray) {
        const filePath =
          (file as globalThis.File & { path?: string }).path || file.name;
        onAddAttachment({ id: filePath, label: file.name });
      }
      onAttachFiles?.(fileArray);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setView("menu");
    }
  };

  const handleAddFile = () => {
    setOpen(false);
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
        <Tooltip content={attachTooltip}>
          <Popover.Trigger>
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              disabled={disabled}
            >
              <Paperclip size={iconSize} weight="bold" />
            </IconButton>
          </Popover.Trigger>
        </Tooltip>
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
                <Tooltip content={issueDisabledReason} side="right">
                  <span>{issueButton}</span>
                </Tooltip>
              ) : (
                issueButton
              )}
            </div>
          ) : (
            <div className="issue-picker">
              <IssuePicker repoPath={repoPath!} onSelect={handleIssueSelect} />
            </div>
          )}
        </Popover.Content>
      </Popover.Root>
    </>
  );
}
