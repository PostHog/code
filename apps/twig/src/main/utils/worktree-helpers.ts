import path from "node:path";
import { getWorktreeLocation } from "../services/settingsStore";

function isLegacyWorktreeName(name: string): boolean {
  return !/^\d+$/.test(name);
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
