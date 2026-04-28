import type { FileDiffMetadata } from "@pierre/diffs";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  buildExpandedFileDiff,
  canExpandFileDiff,
} from "../utils/fileDiffExpansion";

export function useExpandableFileDiff(
  patchFileDiff: FileDiffMetadata,
  repoPath: string | undefined,
  skip: boolean,
): FileDiffMetadata {
  const trpc = useTRPC();
  const filePath = patchFileDiff.name ?? patchFileDiff.prevName ?? "";
  const prevPath = patchFileDiff.prevName ?? filePath;
  const enabled = canExpandFileDiff(patchFileDiff, repoPath, skip);

  const { data: headContent } = useQuery(
    trpc.git.getFileAtHead.queryOptions(
      { directoryPath: repoPath ?? "", filePath: prevPath },
      { enabled, staleTime: 30_000 },
    ),
  );

  const { data: workingContent } = useQuery(
    trpc.fs.readRepoFile.queryOptions(
      { repoPath: repoPath ?? "", filePath },
      { enabled, staleTime: 30_000 },
    ),
  );

  return useMemo(() => {
    if (!enabled) return patchFileDiff;
    return buildExpandedFileDiff(patchFileDiff, headContent, workingContent);
  }, [enabled, patchFileDiff, headContent, workingContent]);
}
