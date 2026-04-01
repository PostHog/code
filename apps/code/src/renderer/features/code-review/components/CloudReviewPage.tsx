import { useCloudChangedFiles } from "@features/task-detail/hooks/useCloudChangedFiles";
import {
  buildCloudEventSummary,
  extractCloudFileDiff,
  type ParsedToolCall,
} from "@features/task-detail/utils/cloudToolChanges";
import type { FileDiffOptions } from "@pierre/diffs";
import { MultiFileDiff } from "@pierre/diffs/react";
import { Flex, Spinner, Text } from "@radix-ui/themes";
import type { ChangedFile, Task } from "@shared/types";
import type { AcpMessage } from "@shared/types/session-events";
import { useMemo } from "react";
import {
  DeferredDiffPlaceholder,
  DiffFileHeader,
  ReviewShell,
  useReviewState,
} from "./ReviewShell";

const EMPTY_EVENTS: AcpMessage[] = [];

interface CloudReviewPageProps {
  taskId: string;
  task: Task;
}

export function CloudReviewPage({ taskId, task }: CloudReviewPageProps) {
  const {
    session,
    effectiveBranch,
    prUrl,
    isRunActive,
    changedFiles,
    isLoading,
  } = useCloudChangedFiles(taskId, task);
  const events = session?.events ?? EMPTY_EVENTS;
  const summary = useMemo(() => buildCloudEventSummary(events), [events]);

  const allPaths = useMemo(
    () => changedFiles.map((f) => f.path),
    [changedFiles],
  );

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
  } = useReviewState(changedFiles, allPaths);

  if (!prUrl && !effectiveBranch && changedFiles.length === 0) {
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
      taskId={taskId}
      fileCount={changedFiles.length}
      linesAdded={linesAdded}
      linesRemoved={linesRemoved}
      isLoading={isLoading && changedFiles.length === 0}
      isEmpty={changedFiles.length === 0}
      allExpanded={collapsedFiles.size === 0}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      onUncollapseFile={uncollapseFile}
    >
      {changedFiles.map((file) => {
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
              toolCalls={summary.toolCalls}
              options={diffOptions}
              collapsed={isCollapsed}
              onToggle={() => toggleFile(file.path)}
            />
          </div>
        );
      })}
    </ReviewShell>
  );
}

function CloudFileDiff({
  file,
  toolCalls,
  options,
  collapsed,
  onToggle,
}: {
  file: ChangedFile;
  toolCalls: Map<string, ParsedToolCall>;
  options: FileDiffOptions<unknown>;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const diff = useMemo(
    () => extractCloudFileDiff(toolCalls, file.path),
    [toolCalls, file.path],
  );

  const fileName = file.path.split("/").pop() || file.path;
  const oldFile = useMemo(
    () => ({ name: fileName, contents: diff?.oldText ?? "" }),
    [fileName, diff],
  );
  const newFile = useMemo(
    () => ({ name: fileName, contents: diff?.newText ?? "" }),
    [fileName, diff],
  );

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{ ...options, collapsed }}
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
