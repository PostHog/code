import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import {
  useLocalBranchChangedFiles,
  usePrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import { usePrDetails } from "@features/git-interaction/hooks/usePrDetails";
import { makeFileKey } from "@features/git-interaction/utils/fileKey";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import type { parsePatchFiles } from "@pierre/diffs";
import { Flex, Text } from "@radix-ui/themes";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import { useTRPC } from "@renderer/trpc/client";
import type { ChangedFile, Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useEffectiveDiffSource } from "../hooks/useEffectiveDiffSource";
import { useReviewDiffs } from "../hooks/useReviewDiffs";
import type { DiffOptions } from "../types";
import type { PrCommentThread } from "../utils/prCommentAnnotations";
import type { ResolvedDiffSource } from "../utils/resolveDiffSource";
import { InteractiveFileDiff } from "./InteractiveFileDiff";
import { LazyDiff } from "./LazyDiff";
import { RemoteDiffList } from "./RemoteDiffList";
import {
  DeferredDiffPlaceholder,
  type DeferredReason,
  DiffFileHeader,
  ReviewShell,
  sumHunkStats,
  useReviewState,
} from "./ReviewShell";

const EMPTY_BRANCH_FILES: ChangedFile[] = [];
const EMPTY_PR_FILES: ChangedFile[] = [];

interface ReviewPageProps {
  task: Task;
}

export function ReviewPage({ task }: ReviewPageProps) {
  const taskId = task.id;
  const repoPath = useCwd(taskId);
  const openFile = usePanelLayoutStore((s) => s.openFile);

  const isReviewOpen = useReviewNavigationStore(
    (s) => (s.reviewModes[taskId] ?? "closed") !== "closed",
  );

  const {
    effectiveSource,
    prUrl,
    linkedBranch,
    defaultBranch,
    branchSourceAvailable,
    prSourceAvailable,
  } = useEffectiveDiffSource(taskId);

  const showReviewComments = useDiffViewerStore((s) => s.showReviewComments);
  const { commentThreads } = usePrDetails(prUrl, {
    includeComments: isReviewOpen && showReviewComments,
  });
  const effectiveCommentThreads = showReviewComments
    ? commentThreads
    : undefined;

  const isLocalActive = isReviewOpen && effectiveSource === "local";

  const {
    changedFiles,
    changesLoading,
    hasStagedFiles,
    stagedParsedFiles,
    unstagedParsedFiles,
    untrackedFiles,
    totalFileCount,
    allPaths,
    diffLoading,
    refetch,
  } = useReviewDiffs(repoPath, isLocalActive);

  const {
    diffOptions,
    linesAdded,
    linesRemoved,
    collapsedFiles,
    toggleFile,
    expandAll,
    collapseAll,
    revealFile,
    getDeferredReason,
    uncollapseFile,
  } = useReviewState(changedFiles, allPaths);

  const stagedPathSet = useMemo(
    () => new Set(stagedParsedFiles.map((f) => f.name ?? f.prevName ?? "")),
    [stagedParsedFiles],
  );

  if (!repoPath) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text color="gray" className="text-sm">
          No repository path available
        </Text>
      </Flex>
    );
  }

  if (effectiveSource === "branch") {
    return (
      <BranchReviewPage
        task={task}
        branch={linkedBranch as string}
        repoPath={repoPath}
        defaultBranch={defaultBranch}
        isReviewOpen={isReviewOpen}
        effectiveSource={effectiveSource}
        branchSourceAvailable={branchSourceAvailable}
        prSourceAvailable={prSourceAvailable}
        prUrl={prUrl}
        commentThreads={effectiveCommentThreads}
      />
    );
  }

  if (effectiveSource === "pr") {
    return (
      <PrReviewPage
        task={task}
        prUrl={prUrl as string}
        defaultBranch={defaultBranch}
        isReviewOpen={isReviewOpen}
        effectiveSource={effectiveSource}
        branchSourceAvailable={branchSourceAvailable}
        prSourceAvailable={prSourceAvailable}
        commentThreads={effectiveCommentThreads}
      />
    );
  }

  const sharedDiffProps = {
    repoPath,
    taskId,
    diffOptions,
    collapsedFiles,
    toggleFile,
    revealFile,
    getDeferredReason,
    openFile,
    prUrl,
    commentThreads: effectiveCommentThreads,
  };

  return (
    <ReviewShell
      task={task}
      fileCount={totalFileCount}
      linesAdded={linesAdded}
      linesRemoved={linesRemoved}
      isLoading={changesLoading || diffLoading}
      isEmpty={totalFileCount === 0}
      allExpanded={collapsedFiles.size === 0}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      onUncollapseFile={uncollapseFile}
      onRefresh={refetch}
      effectiveSource={effectiveSource}
      branchSourceAvailable={branchSourceAvailable}
      prSourceAvailable={prSourceAvailable}
      defaultBranch={defaultBranch}
    >
      {hasStagedFiles && stagedParsedFiles.length > 0 && (
        <>
          <SectionLabel label="Staged Changes" />
          <FileDiffList files={stagedParsedFiles} staged {...sharedDiffProps} />
        </>
      )}
      {hasStagedFiles &&
        (unstagedParsedFiles.length > 0 || untrackedFiles.length > 0) && (
          <SectionLabel label="Changes" />
        )}
      <FileDiffList
        files={unstagedParsedFiles}
        alsoStagedPaths={stagedPathSet}
        {...sharedDiffProps}
      />
      {untrackedFiles.map((file) => {
        const key = makeFileKey(file.staged, file.path);
        const isCollapsed = collapsedFiles.has(key);
        return (
          <div key={key} data-file-path={key}>
            <LazyDiff>
              <UntrackedFileDiff
                file={file}
                repoPath={repoPath}
                options={diffOptions}
                collapsed={isCollapsed}
                onToggle={() => toggleFile(key)}
                taskId={taskId}
              />
            </LazyDiff>
          </div>
        );
      })}
    </ReviewShell>
  );
}

function BranchReviewPage({
  task,
  branch,
  repoPath,
  defaultBranch,
  isReviewOpen,
  effectiveSource,
  branchSourceAvailable,
  prSourceAvailable,
  prUrl,
  commentThreads,
}: {
  task: Task;
  branch: string;
  repoPath: string | null;
  defaultBranch: string | null;
  isReviewOpen: boolean;
  effectiveSource: ResolvedDiffSource;
  branchSourceAvailable: boolean;
  prSourceAvailable: boolean;
  prUrl: string | null;
  commentThreads?: Map<number, PrCommentThread>;
}) {
  const taskId = task.id;

  const { data: files = EMPTY_BRANCH_FILES, isLoading } =
    useLocalBranchChangedFiles(
      isReviewOpen ? repoPath : null,
      isReviewOpen ? branch : null,
    );

  const allPaths = useMemo(() => files.map((f) => f.path), [files]);

  const reviewState = useReviewState(files, allPaths);

  return (
    <ReviewShell
      task={task}
      fileCount={files.length}
      linesAdded={reviewState.linesAdded}
      linesRemoved={reviewState.linesRemoved}
      isLoading={
        (isLoading || (!repoPath && isReviewOpen)) && files.length === 0
      }
      isEmpty={files.length === 0}
      allExpanded={reviewState.collapsedFiles.size === 0}
      onExpandAll={reviewState.expandAll}
      onCollapseAll={reviewState.collapseAll}
      onUncollapseFile={reviewState.uncollapseFile}
      effectiveSource={effectiveSource}
      branchSourceAvailable={branchSourceAvailable}
      prSourceAvailable={prSourceAvailable}
      defaultBranch={defaultBranch}
    >
      <RemoteDiffList
        files={files}
        taskId={taskId}
        prUrl={prUrl}
        options={reviewState.diffOptions}
        collapsedFiles={reviewState.collapsedFiles}
        toggleFile={reviewState.toggleFile}
        revealFile={reviewState.revealFile}
        getDeferredReason={reviewState.getDeferredReason}
        commentThreads={commentThreads}
      />
    </ReviewShell>
  );
}

function PrReviewPage({
  task,
  prUrl,
  defaultBranch,
  isReviewOpen,
  effectiveSource,
  branchSourceAvailable,
  prSourceAvailable,
  commentThreads,
}: {
  task: Task;
  prUrl: string;
  defaultBranch: string | null;
  isReviewOpen: boolean;
  effectiveSource: ResolvedDiffSource;
  branchSourceAvailable: boolean;
  prSourceAvailable: boolean;
  commentThreads?: Map<number, PrCommentThread>;
}) {
  const taskId = task.id;

  const { data: files = EMPTY_PR_FILES, isLoading } = usePrChangedFiles(
    isReviewOpen ? prUrl : null,
  );

  const allPaths = useMemo(() => files.map((f) => f.path), [files]);

  const reviewState = useReviewState(files, allPaths);

  return (
    <ReviewShell
      task={task}
      fileCount={files.length}
      linesAdded={reviewState.linesAdded}
      linesRemoved={reviewState.linesRemoved}
      isLoading={isLoading && files.length === 0}
      isEmpty={files.length === 0}
      allExpanded={reviewState.collapsedFiles.size === 0}
      onExpandAll={reviewState.expandAll}
      onCollapseAll={reviewState.collapseAll}
      onUncollapseFile={reviewState.uncollapseFile}
      effectiveSource={effectiveSource}
      branchSourceAvailable={branchSourceAvailable}
      prSourceAvailable={prSourceAvailable}
      defaultBranch={defaultBranch}
    >
      <RemoteDiffList
        files={files}
        taskId={taskId}
        prUrl={prUrl}
        options={reviewState.diffOptions}
        collapsedFiles={reviewState.collapsedFiles}
        toggleFile={reviewState.toggleFile}
        revealFile={reviewState.revealFile}
        getDeferredReason={reviewState.getDeferredReason}
        commentThreads={commentThreads}
      />
    </ReviewShell>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Flex px="3" py="2">
      <Text color="gray" className="font-medium text-[13px]">
        {label}
      </Text>
    </Flex>
  );
}

interface FileDiffListProps {
  files: ReturnType<typeof parsePatchFiles>[number]["files"];
  staged?: boolean;
  alsoStagedPaths?: Set<string>;
  repoPath: string;
  taskId: string;
  diffOptions: DiffOptions;
  collapsedFiles: Set<string>;
  toggleFile: (key: string) => void;
  revealFile: (key: string) => void;
  getDeferredReason: (key: string) => DeferredReason | null;
  openFile: (taskId: string, path: string, preview: boolean) => void;
  prUrl: string | null;
  commentThreads?: Map<number, PrCommentThread>;
}

function FileDiffList({
  files,
  staged = false,
  alsoStagedPaths,
  repoPath,
  taskId,
  diffOptions,
  collapsedFiles,
  toggleFile,
  revealFile,
  getDeferredReason,
  openFile,
  prUrl,
  commentThreads,
}: FileDiffListProps) {
  return files.map((fileDiff) => {
    const filePath = fileDiff.name ?? fileDiff.prevName ?? "";
    const key = makeFileKey(staged, filePath);
    const isCollapsed = collapsedFiles.has(key);
    const deferredReason = getDeferredReason(key);
    const skipExpansion = staged || (alsoStagedPaths?.has(filePath) ?? false);

    if (deferredReason) {
      const { additions, deletions } = sumHunkStats(fileDiff.hunks);
      return (
        <div key={key} data-file-path={key}>
          <DeferredDiffPlaceholder
            filePath={filePath}
            linesAdded={additions}
            linesRemoved={deletions}
            reason={deferredReason}
            collapsed={isCollapsed}
            onToggle={() => toggleFile(key)}
            onShow={() => revealFile(key)}
          />
        </div>
      );
    }

    return (
      <div key={key} data-file-path={key}>
        <LazyDiff>
          <InteractiveFileDiff
            fileDiff={fileDiff}
            repoPath={repoPath}
            skipExpansion={skipExpansion}
            options={{ ...diffOptions, collapsed: isCollapsed }}
            taskId={taskId}
            prUrl={prUrl}
            commentThreads={commentThreads}
            renderCustomHeader={(fd) => (
              <DiffFileHeader
                fileDiff={fd}
                collapsed={isCollapsed}
                onToggle={() => toggleFile(key)}
                onOpenFile={() =>
                  openFile(taskId, `${repoPath}/${filePath}`, false)
                }
              />
            )}
          />
        </LazyDiff>
      </div>
    );
  });
}

function UntrackedFileDiff({
  file,
  repoPath,
  taskId,
  options,
  collapsed,
  onToggle,
}: {
  file: ChangedFile;
  repoPath: string;
  taskId: string;
  options: DiffOptions;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const trpc = useTRPC();
  const { data: content } = useQuery(
    trpc.fs.readRepoFile.queryOptions(
      { repoPath, filePath: file.path },
      { staleTime: 30_000 },
    ),
  );

  const oldFile = useMemo(
    () => ({ name: file.path, contents: "" }),
    [file.path],
  );
  const newFile = useMemo(
    () => ({ name: file.path, contents: content ?? "" }),
    [file.path, content],
  );

  return (
    <InteractiveFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{ ...options, collapsed }}
      taskId={taskId}
      renderCustomHeader={(fd) => (
        <DiffFileHeader
          fileDiff={fd}
          collapsed={collapsed}
          onToggle={onToggle}
        />
      )}
    />
  );
}
