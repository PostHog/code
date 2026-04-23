import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import type { DiffStats } from "@features/git-interaction/utils/diffStats";
import { makeFileKey } from "@features/git-interaction/utils/fileKey";
import { invalidateGitWorkingTreeQueries } from "@features/git-interaction/utils/gitCacheKeys";
import { parsePatchFiles } from "@pierre/diffs";
import { useTRPC } from "@renderer/trpc/client";
import type { ChangedFile } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import {
  useInvalidateSandboxQueries,
  useSandboxChangedFiles,
  useSandboxDiffCached,
  useSandboxDiffUnstaged,
} from "./useSandboxGit";

export type { DiffStats };

export interface ReviewDataResult {
  changedFiles: ChangedFile[];
  changesLoading: boolean;
  diffStats: DiffStats;
  hasStagedFiles: boolean;
  stagedParsedFiles: ReturnType<typeof parsePatchFiles>[number]["files"];
  unstagedParsedFiles: ReturnType<typeof parsePatchFiles>[number]["files"];
  untrackedFiles: ChangedFile[];
  totalFileCount: number;
  allPaths: string[];
  diffLoading: boolean;
  refetch: () => void;
}

// --- Shared diff transform ---

function useDiffTransform(
  changedFiles: ChangedFile[],
  rawDiffCached: string | undefined,
  rawDiffUnstaged: string | undefined,
  diffCachedLoading: boolean,
  diffUnstagedLoading: boolean,
) {
  const hasStagedFiles = useMemo(
    () => changedFiles.some((f) => f.staged),
    [changedFiles],
  );

  const diffLoading =
    diffUnstagedLoading || (hasStagedFiles && diffCachedLoading);

  const stagedParsedFiles = useMemo(
    () =>
      rawDiffCached
        ? parsePatchFiles(rawDiffCached).flatMap((p) => p.files)
        : [],
    [rawDiffCached],
  );

  const unstagedParsedFiles = useMemo(
    () =>
      rawDiffUnstaged
        ? parsePatchFiles(rawDiffUnstaged).flatMap((p) => p.files)
        : [],
    [rawDiffUnstaged],
  );

  const untrackedFiles = useMemo(
    () => changedFiles.filter((f) => f.status === "untracked"),
    [changedFiles],
  );

  const totalFileCount =
    stagedParsedFiles.length +
    unstagedParsedFiles.length +
    untrackedFiles.length;

  const allPaths = useMemo(
    () => [
      ...stagedParsedFiles.map((f) =>
        makeFileKey(true, f.name ?? f.prevName ?? ""),
      ),
      ...unstagedParsedFiles.map((f) =>
        makeFileKey(false, f.name ?? f.prevName ?? ""),
      ),
      ...untrackedFiles.map((f) => makeFileKey(f.staged, f.path)),
    ],
    [stagedParsedFiles, unstagedParsedFiles, untrackedFiles],
  );

  return {
    hasStagedFiles,
    stagedParsedFiles,
    unstagedParsedFiles,
    untrackedFiles,
    totalFileCount,
    allPaths,
    diffLoading,
  };
}

// --- Local implementation ---

export function useLocalReviewData(
  repoPath: string | undefined,
  isActive: boolean,
): ReviewDataResult {
  const trpc = useTRPC();
  const { changedFiles, changesLoading, diffStats } = useGitQueries(repoPath);
  const hideWhitespace = useDiffViewerStore((s) => s.hideWhitespaceChanges);

  const {
    data: rawDiffCached,
    isLoading: diffCachedLoading,
    refetch: refetchDiffCached,
  } = useQuery(
    trpc.git.getDiffCached.queryOptions(
      { directoryPath: repoPath as string, ignoreWhitespace: hideWhitespace },
      {
        enabled: isActive && !!repoPath && changedFiles.some((f) => f.staged),
        staleTime: 30_000,
        refetchOnMount: "always",
      },
    ),
  );

  const {
    data: rawDiffUnstaged,
    isLoading: diffUnstagedLoading,
    refetch: refetchDiffUnstaged,
  } = useQuery(
    trpc.git.getDiffUnstaged.queryOptions(
      { directoryPath: repoPath as string, ignoreWhitespace: hideWhitespace },
      {
        enabled: isActive && !!repoPath,
        staleTime: 30_000,
        refetchOnMount: "always",
      },
    ),
  );

  const transform = useDiffTransform(
    changedFiles,
    rawDiffCached,
    rawDiffUnstaged,
    diffCachedLoading,
    diffUnstagedLoading,
  );

  const refetch = useCallback(() => {
    if (repoPath) invalidateGitWorkingTreeQueries(repoPath);
    refetchDiffUnstaged();
    if (transform.hasStagedFiles) refetchDiffCached();
  }, [
    repoPath,
    transform.hasStagedFiles,
    refetchDiffCached,
    refetchDiffUnstaged,
  ]);

  return {
    changedFiles,
    changesLoading,
    diffStats,
    ...transform,
    refetch,
  };
}

// --- Cloud implementation (sandbox commands) ---

export function useCloudReviewData(
  taskId: string,
  isActive: boolean,
): ReviewDataResult {
  const hideWhitespace = useDiffViewerStore((s) => s.hideWhitespaceChanges);
  const invalidateSandbox = useInvalidateSandboxQueries(taskId);

  // Changed files always polls so DiffStatsBadge has data even when the
  // review panel is closed. The heavier diff queries only fire when active.
  const { data: changedFiles = [], isLoading: changesLoading } =
    useSandboxChangedFiles(taskId, {
      refetchInterval: 10_000,
    });

  const hasStagedFiles = useMemo(
    () => changedFiles.some((f: ChangedFile) => f.staged),
    [changedFiles],
  );

  const { data: rawDiffCached, isLoading: diffCachedLoading } =
    useSandboxDiffCached(taskId, {
      enabled: isActive && hasStagedFiles,
      ignoreWhitespace: hideWhitespace,
    });

  const { data: rawDiffUnstaged, isLoading: diffUnstagedLoading } =
    useSandboxDiffUnstaged(taskId, {
      enabled: isActive,
      ignoreWhitespace: hideWhitespace,
    });

  const transform = useDiffTransform(
    changedFiles,
    rawDiffCached,
    rawDiffUnstaged,
    diffCachedLoading,
    diffUnstagedLoading,
  );

  const refetch = useCallback(() => {
    invalidateSandbox();
  }, [invalidateSandbox]);

  // Cloud doesn't have a separate diff stats query — derive from changed files
  const diffStats = useMemo<DiffStats>(() => {
    let linesAdded = 0;
    let linesRemoved = 0;
    for (const f of changedFiles) {
      linesAdded += f.linesAdded ?? 0;
      linesRemoved += f.linesRemoved ?? 0;
    }
    return { filesChanged: changedFiles.length, linesAdded, linesRemoved };
  }, [changedFiles]);

  return {
    changedFiles,
    changesLoading,
    diffStats,
    ...transform,
    refetch,
  };
}
