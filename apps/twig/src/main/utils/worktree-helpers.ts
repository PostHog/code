import path from "node:path";
import type { TaskFolderAssociation } from "@shared/types";
import { getWorktreeLocation } from "../services/settingsStore";
import { foldersStore } from "./store.js";

export function getTaskAssociations(): TaskFolderAssociation[] {
  return foldersStore.get("taskAssociations", []);
}

export function isLegacyWorktreeName(name: string): boolean {
  return !/^\d+$/.test(name);
}

export function getFolderPath(folderId: string): string | null {
  const folders = foldersStore.get("folders", []);
  const folder = folders.find((f) => f.id === folderId);
  return folder?.path ?? null;
}

export function deriveWorktreePath(
  folderPath: string,
  worktreeName: string,
): string {
  const worktreeBasePath = getWorktreeLocation();
  const repoName = path.basename(folderPath);
  if (isLegacyWorktreeName(worktreeName)) {
    return path.join(worktreeBasePath, repoName, worktreeName);
  }
  return path.join(worktreeBasePath, worktreeName, repoName);
}
