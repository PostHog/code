import type { ChangedFile } from "@shared/types";

export interface DiffStats {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}

export function computeDiffStats(files: ChangedFile[]): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const file of files) {
    linesAdded += file.linesAdded ?? 0;
    linesRemoved += file.linesRemoved ?? 0;
  }
  return { filesChanged: files.length, linesAdded, linesRemoved };
}
