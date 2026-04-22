import { makeFileKey } from "@features/git-interaction/utils/fileKey";
import type { parsePatchFiles } from "@pierre/diffs";
import { Flex, Text } from "@radix-ui/themes";
import type { ChangedFile, Task } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ReviewGitProvider, useReviewGit } from "../hooks/ReviewGitProvider";
import type { DiffOptions } from "../types";
import { InteractiveFileDiff } from "./InteractiveFileDiff";
import { LazyDiff } from "./LazyDiff";
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
  return (
    <ReviewGitProvider taskId={task.id}>
      <ReviewPageBody task={task} />
    </ReviewGitProvider>
  );
}

function ReviewPageBody({ task }: { task: Task }) {
  const taskId = task.id;
  const {
    reviewData: {
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
    },
  } = useReviewGit();

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
          <FileDiffList
            files={stagedParsedFiles}
            staged
            taskId={taskId}
            diffOptions={diffOptions}
            collapsedFiles={collapsedFiles}
            toggleFile={toggleFile}
            revealFile={revealFile}
            getDeferredReason={getDeferredReason}
          />
        </>
      )}
      {hasStagedFiles &&
        (unstagedParsedFiles.length > 0 || untrackedFiles.length > 0) && (
          <SectionLabel label="Changes" />
        )}
      <FileDiffList
        files={unstagedParsedFiles}
        taskId={taskId}
        diffOptions={diffOptions}
        collapsedFiles={collapsedFiles}
        toggleFile={toggleFile}
        revealFile={revealFile}
        getDeferredReason={getDeferredReason}
      />
      {untrackedFiles.map((file) => {
        const key = makeFileKey(file.staged, file.path);
        const isCollapsed = collapsedFiles.has(key);
        return (
          <div key={key} data-file-path={key}>
            <LazyDiff>
              <UntrackedFileDiff
                file={file}
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
  taskId: string;
  diffOptions: DiffOptions;
  collapsedFiles: Set<string>;
  toggleFile: (key: string) => void;
  revealFile: (key: string) => void;
  getDeferredReason: (key: string) => DeferredReason | null;
}

function FileDiffList({
  files,
  staged = false,
  taskId,
  diffOptions,
  collapsedFiles,
  toggleFile,
  revealFile,
  getDeferredReason,
}: FileDiffListProps) {
  const { openFile } = useReviewGit();
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
        <LazyDiff>
          <InteractiveFileDiff
            fileDiff={fileDiff}
            options={{ ...diffOptions, collapsed: isCollapsed }}
            taskId={taskId}
            renderCustomHeader={(fd) => (
              <DiffFileHeader
                fileDiff={fd}
                collapsed={isCollapsed}
                onToggle={() => toggleFile(key)}
                onOpenFile={openFile ? () => openFile(filePath) : undefined}
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
  taskId,
  options,
  collapsed,
  onToggle,
}: {
  file: ChangedFile;
  taskId: string;
  options: DiffOptions;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const { readFileFn, readFileQueryKeyPrefix } = useReviewGit();
  const { data: content } = useQuery({
    queryKey: [...readFileQueryKeyPrefix, file.path],
    queryFn: () => readFileFn(file.path),
    staleTime: 30_000,
  });

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
