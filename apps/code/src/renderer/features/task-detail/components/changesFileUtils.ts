import type { ChangedFile, GitFileStatus } from "@shared/types";

export function getStatusIndicator(status: GitFileStatus): {
  label: string;
  fullLabel: string;
  color: "green" | "orange" | "red" | "blue" | "gray";
} {
  switch (status) {
    case "added":
    case "untracked":
      return { label: "A", fullLabel: "Added", color: "green" };
    case "deleted":
      return { label: "D", fullLabel: "Deleted", color: "red" };
    case "modified":
      return { label: "M", fullLabel: "Modified", color: "orange" };
    case "renamed":
      return { label: "R", fullLabel: "Renamed", color: "blue" };
    default:
      return { label: "?", fullLabel: "Unknown", color: "gray" };
  }
}

export function getDiscardInfo(
  file: ChangedFile,
  fileName: string,
): { message: string; action: string } {
  switch (file.status) {
    case "modified":
      return {
        message: `Are you sure you want to discard changes in '${fileName}'?`,
        action: "Discard File",
      };
    case "deleted":
      return {
        message: `Are you sure you want to restore '${fileName}'?`,
        action: "Restore File",
      };
    case "added":
      return {
        message: `Are you sure you want to remove '${fileName}'?`,
        action: "Remove File",
      };
    case "untracked":
      return {
        message: `Are you sure you want to delete '${fileName}'?`,
        action: "Delete File",
      };
    case "renamed":
      return {
        message: `Are you sure you want to undo the rename of '${fileName}'?`,
        action: "Undo Rename File",
      };
    default:
      return {
        message: `Are you sure you want to discard changes in '${fileName}'?`,
        action: "Discard File",
      };
  }
}
