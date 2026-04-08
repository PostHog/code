import { useCloudChangedFiles } from "@features/task-detail/hooks/useCloudChangedFiles";
import type { FileDiffMetadata } from "@pierre/diffs";
import { processFile } from "@pierre/diffs";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import type { ChangedFile, Task } from "@shared/types";
import { useMemo } from "react";
import { useReviewComment } from "../hooks/useReviewComment";
import type { DiffOptions, OnCommentCallback } from "../types";
import { InteractiveFileDiff } from "./InteractiveFileDiff";
import {
  DeferredDiffPlaceholder,
  DiffFileHeader,
  ReviewShell,
  useReviewState,
} from "./ReviewShell";

interface CloudReviewPageProps {
  task: Task;
}

export function CloudReviewPage({ task }: CloudReviewPageProps) {
  const taskId = task.id;
  const isReviewOpen = useReviewNavigationStore(
    (s) => (s.reviewModes[taskId] ?? "closed") !== "closed",
  );
  const { effectiveBranch, prUrl, isRunActive, remoteFiles, isLoading } =
    useCloudChangedFiles(taskId, task, isReviewOpen);
  const onComment = useReviewComment(taskId);

  const allPaths = useMemo(() => remoteFiles.map((f) => f.path), [remoteFiles]);

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
  } = useReviewState(remoteFiles, allPaths);

  if (!prUrl && !effectiveBranch && remoteFiles.length === 0) {
    if (isRunActive) {
      return (
        <Flex align="center" justify="center" height="100%">
          <Flex align="center" gap="2">
            <Spinner size="1" />
            <Text size="2" color="gray">
              Waiting for changes...
            </Text>
          </Flex>
        </Flex>
      );
    }
    return (
      <Flex align="center" justify="center" height="100%">
        <Text size="2" color="gray">
          No file changes yet
        </Text>
      </Flex>
    );
  }

  return (
    <ReviewShell
      task={task}
      fileCount={remoteFiles.length}
      linesAdded={linesAdded}
      linesRemoved={linesRemoved}
      isLoading={isLoading && remoteFiles.length === 0}
      isEmpty={remoteFiles.length === 0}
      allExpanded={collapsedFiles.size === 0}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      onUncollapseFile={uncollapseFile}
    >
      {remoteFiles.map((file) => {
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
            <CloudFileDiff
              file={file}
              prUrl={prUrl}
              options={diffOptions}
              collapsed={isCollapsed}
              onToggle={() => toggleFile(file.path)}
              onComment={onComment}
            />
          </div>
        );
      })}
    </ReviewShell>
  );
}

function CloudFileDiff({
  file,
  prUrl,
  options,
  collapsed,
  onToggle,
  onComment,
}: {
  file: ChangedFile;
  prUrl: string | null;
  options: DiffOptions;
  collapsed: boolean;
  onToggle: () => void;
  onComment: OnCommentCallback;
}) {
  const fileDiff = useMemo((): FileDiffMetadata | undefined => {
    if (!file.patch) return undefined;
    return processFile(file.patch, { isGitDiff: true });
  }, [file.patch]);

  if (!fileDiff) {
    const hasChanges = (file.linesAdded ?? 0) + (file.linesRemoved ?? 0) > 0;
    const reason = hasChanges ? "large" : "unavailable";
    const githubFileUrl = prUrl
      ? `${prUrl}/files#diff-${file.path.replaceAll("/", "-")}`
      : undefined;
    return (
      <DeferredDiffPlaceholder
        filePath={file.path}
        linesAdded={file.linesAdded ?? 0}
        linesRemoved={file.linesRemoved ?? 0}
        reason={reason}
        collapsed={collapsed}
        onToggle={onToggle}
        externalUrl={githubFileUrl}
      />
    );
  }

  return (
    <InteractiveFileDiff
      fileDiff={fileDiff}
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
