import { trpc, useTRPC } from "@renderer/trpc/client";
import type { MentionItem } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@utils/queryClient";
import { byLengthAsc, Fzf } from "fzf";
import { useMemo } from "react";

export interface FileItem {
  path: string;
  name: string;
  dir: string;
  kind: "file" | "directory";
}

const MENTION_DISPLAY_LIMIT = 20;

export function pathToFileItem(path: string): FileItem {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  const dir = parts.join("/");
  return { path, name, dir, kind: "file" };
}

function pathToFolderItem(path: string): FileItem {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  const dir = parts.join("/");
  return { path, name, dir, kind: "directory" };
}

function transformRawFiles(
  rawFiles: MentionItem[],
  includeDirectories: boolean,
): FileItem[] {
  return rawFiles
    .filter((file): file is MentionItem & { path: string } => !!file.path)
    .filter((file) => includeDirectories || file.kind !== "directory")
    .map((file) =>
      file.kind === "directory"
        ? pathToFolderItem(file.path)
        : pathToFileItem(file.path),
    );
}

function createFzf(files: FileItem[]): Fzf<FileItem[]> {
  return new Fzf(files, {
    selector: (item) =>
      item.kind === "directory"
        ? `${item.name}/ ${item.path}/`
        : `${item.name} ${item.path}`,
    limit: MENTION_DISPLAY_LIMIT,
    tiebreakers: [byLengthAsc],
  });
}

export function useRepoFiles(
  repoPath: string | undefined,
  enabled = true,
  options: { includeDirectories?: boolean } = {},
) {
  const { includeDirectories = false } = options;
  const trpcReact = useTRPC();
  const { data: rawFiles, isLoading } = useQuery(
    trpcReact.fs.listRepoFiles.queryOptions(
      { repoPath: repoPath ?? "" },
      { enabled: enabled && !!repoPath },
    ),
  );

  const files: FileItem[] = useMemo(() => {
    if (!rawFiles) return [];
    return transformRawFiles(rawFiles, includeDirectories);
  }, [rawFiles, includeDirectories]);

  const fzf = useMemo(() => createFzf(files), [files]);

  return { files, fzf, isLoading };
}

export function searchFiles(
  fzf: Fzf<FileItem[]>,
  files: FileItem[],
  query: string,
): FileItem[] {
  if (!query.trim()) {
    return files.slice(0, MENTION_DISPLAY_LIMIT);
  }
  const results = fzf.find(query);
  return results.map((result) => result.item);
}

const fzfCache = new Map<
  string,
  { fzf: Fzf<FileItem[]>; filesLength: number }
>();

function fzfCacheKey(repoPath: string, includeDirectories: boolean): string {
  return `${repoPath}\u0000${includeDirectories ? "1" : "0"}`;
}

export async function fetchRepoFiles(
  repoPath: string,
  options: { includeDirectories?: boolean } = {},
): Promise<{
  files: FileItem[];
  fzf: Fzf<FileItem[]>;
}> {
  const { includeDirectories = false } = options;
  const rawFiles = await queryClient.fetchQuery({
    ...trpc.fs.listRepoFiles.queryOptions({ repoPath }),
    staleTime: 1000 * 60 * 5,
  });

  const files = transformRawFiles(
    rawFiles as MentionItem[],
    includeDirectories,
  );

  const cacheKey = fzfCacheKey(repoPath, includeDirectories);
  const cached = fzfCache.get(cacheKey);
  if (cached && cached.filesLength === files.length) {
    return { files, fzf: cached.fzf };
  }

  const fzf = createFzf(files);
  fzfCache.set(cacheKey, {
    fzf,
    filesLength: files.length,
  });
  return { files, fzf };
}
