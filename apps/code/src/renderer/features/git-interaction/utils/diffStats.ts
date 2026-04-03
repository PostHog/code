import type { ChangedFile } from "@shared/types";

export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export function computeDiffStats(files: ChangedFile[]): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;
  const uniquePaths = new Set<string>();
  for (const file of files) {
    linesAdded += file.linesAdded ?? 0;
    linesRemoved += file.linesRemoved ?? 0;
    uniquePaths.add(file.path);
  }
  return { filesChanged: uniquePaths.size, linesAdded, linesRemoved };
}

export function formatFileCountLabel(
  stagedOnly: boolean,
  stagedFileCount: number,
  totalFileCount: number,
): string {
  if (stagedOnly) {
    return `${stagedFileCount} staged file${stagedFileCount === 1 ? "" : "s"}`;
  }
  return `${totalFileCount} file${totalFileCount === 1 ? "" : "s"}`;
}
