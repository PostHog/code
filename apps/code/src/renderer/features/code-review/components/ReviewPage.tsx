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
import { useReviewComment } from "../hooks/useReviewComment";
import { useReviewDiffs } from "../hooks/useReviewDiffs";
import type { DiffOptions, OnCommentCallback } from "../types";
import { InteractiveFileDiff } from "./InteractiveFileDiff";
import {
  DeferredDiffPlaceholder,
  type DeferredReason,
  DiffFileHeader,
  ReviewShell,
  sumHunkStats,
  useReviewState,
} from "./ReviewShell";

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
  const onComment = useReviewComment(taskId);

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
  } = useReviewDiffs(repoPath, isReviewOpen);

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

  if (!repoPath) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text size="2" color="gray">
          No repository path available
        </Text>
      </Flex>
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
    onComment,
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
      <FileDiffList files={unstagedParsedFiles} {...sharedDiffProps} />
      {untrackedFiles.map((file) => {
        const key = makeFileKey(file.staged, file.path);
        const isCollapsed = collapsedFiles.has(key);
        return (
          <div key={key} data-file-path={key}>
            <UntrackedFileDiff
              file={file}
              repoPath={repoPath}
              options={diffOptions}
              collapsed={isCollapsed}
              onToggle={() => toggleFile(key)}
              onComment={onComment}
            />
          </div>
        );
      })}
    </ReviewShell>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Flex px="3" py="2">
      <Text size="1" color="gray" weight="medium">
        {label}
      </Text>
    </Flex>
  );
}

interface FileDiffListProps {
  files: ReturnType<typeof parsePatchFiles>[number]["files"];
  staged?: boolean;
  repoPath: string;
  taskId: string;
  diffOptions: DiffOptions;
  collapsedFiles: Set<string>;
  toggleFile: (key: string) => void;
  revealFile: (key: string) => void;
  getDeferredReason: (key: string) => DeferredReason | null;
  openFile: (taskId: string, path: string, preview: boolean) => void;
  onComment: OnCommentCallback;
}

function FileDiffList({
  files,
  staged = false,
  repoPath,
  taskId,
  diffOptions,
  collapsedFiles,
  toggleFile,
  revealFile,
  getDeferredReason,
  openFile,
  onComment,
}: FileDiffListProps) {
  return files.map((fileDiff) => {
    const filePath = fileDiff.name ?? fileDiff.prevName ?? "";
    const key = makeFileKey(staged, filePath);
    const isCollapsed = collapsedFiles.has(key);
    const deferredReason = getDeferredReason(key);

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
        <InteractiveFileDiff
          fileDiff={fileDiff}
          repoPath={repoPath}
          options={{ ...diffOptions, collapsed: isCollapsed }}
          onComment={onComment}
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
      </div>
    );
  });
}

function UntrackedFileDiff({
  file,
  repoPath,
  options,
  collapsed,
  onToggle,
  onComment,
}: {
  file: ChangedFile;
  repoPath: string;
  options: DiffOptions;
  collapsed: boolean;
  onToggle: () => void;
  onComment: OnCommentCallback;
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
      onComment={onComment}
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
