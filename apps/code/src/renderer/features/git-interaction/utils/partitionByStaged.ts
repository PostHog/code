import type { ChangedFile } from "@shared/types";

export function partitionByStaged(files: ChangedFile[]): {
  stagedFiles: ChangedFile[];
  unstagedFiles: ChangedFile[];
} {
  const stagedFiles: ChangedFile[] = [];
  const unstagedFiles: ChangedFile[] = [];
  for (const f of files) {
    if (f.staged) stagedFiles.push(f);
    else unstagedFiles.push(f);
  }
  return { stagedFiles, unstagedFiles };
}
