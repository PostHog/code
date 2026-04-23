import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useIsWorkspaceCloudRun } from "@features/workspace/hooks/useWorkspace";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import { trpcClient } from "@renderer/trpc/client";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import {
  type DiffStats,
  type ReviewDataResult,
  useCloudReviewData,
  useLocalReviewData,
} from "./useReviewData";
import { sendSandboxCommand, useCloudCommandContext } from "./useSandboxGit";

export interface ReviewGitOps {
  reviewData: ReviewDataResult;
  diffStats: DiffStats;
  diffStatsLoading: boolean;
  readFileFn: (filePath: string) => Promise<string>;
  readFileQueryKeyPrefix: readonly unknown[];
  /** Opens a file in the editor panel. Undefined when not supported (e.g., cloud runs). */
  openFile: ((filePath: string) => void) | undefined;
}

const ReviewGitContext = createContext<ReviewGitOps | null>(null);

export function useReviewGit(): ReviewGitOps {
  const ctx = useContext(ReviewGitContext);
  if (!ctx) {
    throw new Error("useReviewGit must be used within a ReviewGitProvider");
  }
  return ctx;
}

// --- Public provider ---

interface ReviewGitProviderProps {
  taskId: string;
  children: ReactNode;
}

export function ReviewGitProvider({
  taskId,
  children,
}: ReviewGitProviderProps) {
  const isCloud = useIsWorkspaceCloudRun(taskId);
  if (isCloud) {
    return (
      <CloudReviewGitProvider taskId={taskId}>
        {children}
      </CloudReviewGitProvider>
    );
  }
  return (
    <LocalReviewGitProvider taskId={taskId}>{children}</LocalReviewGitProvider>
  );
}

// --- Local provider ---

function LocalReviewGitProvider({ taskId, children }: ReviewGitProviderProps) {
  const repoPath = useCwd(taskId);
  const isReviewOpen = useReviewNavigationStore(
    (s) => (s.reviewModes[taskId] ?? "closed") !== "closed",
  );

  const reviewData = useLocalReviewData(repoPath, isReviewOpen);
  const panelOpenFile = usePanelLayoutStore((s) => s.openFile);

  const openFile = useCallback(
    (filePath: string) => {
      if (!repoPath) return;
      panelOpenFile(taskId, `${repoPath}/${filePath}`, false);
    },
    [taskId, repoPath, panelOpenFile],
  );

  const readFileFn = useCallback(
    async (filePath: string): Promise<string> => {
      if (!repoPath) return "";
      return (
        (await trpcClient.fs.readRepoFile.query({ repoPath, filePath })) ?? ""
      );
    },
    [repoPath],
  );

  const readFileQueryKeyPrefix = useMemo(
    () => ["local-file", taskId] as const,
    [taskId],
  );

  const value = useMemo<ReviewGitOps>(
    () => ({
      reviewData,
      diffStats: reviewData.diffStats,
      diffStatsLoading: false,
      readFileFn,
      readFileQueryKeyPrefix,
      openFile: repoPath ? openFile : undefined,
    }),
    [reviewData, readFileFn, readFileQueryKeyPrefix, openFile, repoPath],
  );

  return (
    <ReviewGitContext.Provider value={value}>
      {children}
    </ReviewGitContext.Provider>
  );
}

// --- Cloud provider ---

function CloudReviewGitProvider({ taskId, children }: ReviewGitProviderProps) {
  const isReviewOpen = useReviewNavigationStore(
    (s) => (s.reviewModes[taskId] ?? "closed") !== "closed",
  );

  const reviewData = useCloudReviewData(taskId, isReviewOpen);
  const ctx = useCloudCommandContext(taskId);

  const readFileFn = useCallback(
    async (filePath: string): Promise<string> => {
      if (!ctx) return "";
      const result = await sendSandboxCommand<{ content: string }>(
        ctx,
        "fs/read_file",
        { filePath },
      );
      return result.content;
    },
    [ctx],
  );

  const readFileQueryKeyPrefix = useMemo(
    () => ["sandbox-file", taskId] as const,
    [taskId],
  );

  const value = useMemo<ReviewGitOps>(
    () => ({
      reviewData,
      diffStats: reviewData.diffStats,
      diffStatsLoading: reviewData.changesLoading,
      readFileFn,
      openFile: undefined,
      readFileQueryKeyPrefix,
    }),
    [reviewData, readFileFn, readFileQueryKeyPrefix],
  );

  return (
    <ReviewGitContext.Provider value={value}>
      {children}
    </ReviewGitContext.Provider>
  );
}
