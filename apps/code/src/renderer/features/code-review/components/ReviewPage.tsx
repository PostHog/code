import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { makeFileKey } from "@features/git-interaction/utils/fileKey";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import type { parsePatchFiles } from "@pierre/diffs";
import { Flex, Text } from "@radix-ui/themes";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import { useTRPC } from "@renderer/trpc/client";
import type { ChangedFile, Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useReviewDiffs } from "../hooks/useReviewDiffs";
import type { DiffOptions } from "../types";
import {
  type ResolvedDiffSource,
  resolveDiffSource,
} from "../utils/resolveDiffSource";
import { InteractiveFileDiff } from "./InteractiveFileDiff";
import { LazyDiff } from "./LazyDiff";
import { PatchedFileDiff } from "./PatchedFileDiff";
import {
  DeferredDiffPlaceholder,
  type DeferredReason,
  DiffFileHeader,
  ReviewShell,
  sumHunkStats,
  useReviewState,
} from "./ReviewShell";

const EMPTY_BRANCH_FILES: ChangedFile[] = [];

interface ReviewPageProps {
  task: Task;
}

export function ReviewPage({ task }: ReviewPageProps) {
  const taskId = task.id;
  const repoPath = useCwd(taskId);
  const workspace = useWorkspace(taskId);
  const linkedBranch = workspace?.linkedBranch ?? null;
  const openFile = usePanelLayoutStore((s) => s.openFile);

  const isReviewOpen = useReviewNavigationStore(
    (s) => (s.reviewModes[taskId] ?? "closed") !== "closed",
  );

  const configuredSource = useDiffViewerStore(
    (s) => s.diffSource[taskId] ?? null,
  );

  const {
    repoInfo,
    aheadOfDefault,
    defaultBranch,
    changedFiles: workspaceFiles,
  } = useGitQueries(repoPath);
  const hasLocalChanges = workspaceFiles.length > 0;
  const branchSourceAvailable = !!linkedBranch && aheadOfDefault > 0;

  const effectiveSource = resolveDiffSource({
    configured: configuredSource,
    hasLocalChanges,
    linkedBranch,
    aheadOfDefault,
  });

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
        repoInfo={repoInfo ?? undefined}
        defaultBranch={defaultBranch}
        isReviewOpen={isReviewOpen}
        effectiveSource={effectiveSource}
        branchSourceAvailable={branchSourceAvailable}
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
  repoInfo,
  defaultBranch,
  isReviewOpen,
  effectiveSource,
  branchSourceAvailable,
}: {
  task: Task;
  branch: string;
  repoInfo: { organization: string; repository: string } | undefined;
  defaultBranch: string | null;
  isReviewOpen: boolean;
  effectiveSource: ResolvedDiffSource;
  branchSourceAvailable: boolean;
}) {
  const taskId = task.id;
  const trpc = useTRPC();

  const repoSlug = repoInfo
    ? `${repoInfo.organization}/${repoInfo.repository}`
    : null;

  const { data: files = EMPTY_BRANCH_FILES, isLoading } = useQuery(
    trpc.git.getBranchChangedFiles.queryOptions(
      { repo: repoSlug as string, branch },
      {
        enabled: isReviewOpen && !!repoSlug,
        staleTime: 30_000,
        refetchInterval: 30_000,
        retry: 1,
      },
    ),
  );

  const allPaths = useMemo(() => files.map((f) => f.path), [files]);

  const {
    diffOptions,
    linesAdded,
    linesRemoved,
    collapsedFiles,
    toggleFile,
    expandAll,
    collapseAll,
    uncollapseFile,
    revealFile,
    getDeferredReason,
  } = useReviewState(files, allPaths);

  return (
    <ReviewShell
      task={task}
      fileCount={files.length}
      linesAdded={linesAdded}
      linesRemoved={linesRemoved}
      isLoading={
        (isLoading || (!repoSlug && isReviewOpen)) && files.length === 0
      }
      isEmpty={files.length === 0}
      allExpanded={collapsedFiles.size === 0}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      onUncollapseFile={uncollapseFile}
      effectiveSource={effectiveSource}
      branchSourceAvailable={branchSourceAvailable}
      defaultBranch={defaultBranch}
    >
      {files.map((file) => {
        const isCollapsed = collapsedFiles.has(file.path);
        const deferredReason = getDeferredReason(file.path);

        if (deferredReason) {
          return (
            <div key={file.path} data-file-path={file.path}>
              <DeferredDiffPlaceholder
                filePath={file.path}
                linesAdded={file.linesAdded ?? 0}
                linesRemoved={file.linesRemoved ?? 0}
                reason={deferredReason}
                collapsed={isCollapsed}
                onToggle={() => toggleFile(file.path)}
                onShow={() => revealFile(file.path)}
              />
            </div>
          );
        }

        return (
          <div key={file.path} data-file-path={file.path}>
            <LazyDiff>
              <PatchedFileDiff
                file={file}
                taskId={taskId}
                options={diffOptions}
                collapsed={isCollapsed}
                onToggle={() => toggleFile(file.path)}
              />
            </LazyDiff>
          </div>
        );
      })}
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

  const fileName = file.path.split("/").pop() || file.path;
  const oldFile = useMemo(() => ({ name: fileName, contents: "" }), [fileName]);
  const newFile = useMemo(
    () => ({ name: fileName, contents: content ?? "" }),
    [fileName, content],
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
