import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { type FileDiffOptions, parsePatchFiles } from "@pierre/diffs";
import { MultiFileDiff } from "@pierre/diffs/react";
import { Flex, Text } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import type { ChangedFile } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { RevertableFileDiff } from "./RevertableFileDiff";
import {
  DeferredDiffPlaceholder,
  DiffFileHeader,
  ReviewShell,
  sumHunkStats,
  useReviewState,
} from "./ReviewShell";

interface ReviewPageProps {
  taskId: string;
}

export function ReviewPage({ taskId }: ReviewPageProps) {
  const trpc = useTRPC();
  const repoPath = useCwd(taskId);
  const { changedFiles, changesLoading } = useGitQueries(repoPath);
  const hideWhitespace = useDiffViewerStore((s) => s.hideWhitespaceChanges);
  const openFile = usePanelLayoutStore((s) => s.openFile);

  const { data: rawDiff, isLoading: diffLoading } = useQuery(
    trpc.git.getDiffHead.queryOptions(
      { directoryPath: repoPath as string, ignoreWhitespace: hideWhitespace },
      { enabled: !!repoPath, staleTime: 30_000, refetchOnMount: "always" },
    ),
  );

  const parsedFiles = useMemo(() => {
    if (!rawDiff) return [];
    const patches = parsePatchFiles(rawDiff);
    return patches.flatMap((p) => p.files);
  }, [rawDiff]);

  const untrackedFiles = useMemo(
    () => changedFiles.filter((f) => f.status === "untracked"),
    [changedFiles],
  );

  const totalFileCount = parsedFiles.length + untrackedFiles.length;

  const allPaths = useMemo(
    () => [
      ...parsedFiles.map((f) => f.name ?? f.prevName ?? ""),
      ...untrackedFiles.map((f) => f.path),
    ],
    [parsedFiles, untrackedFiles],
  );

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

  return (
    <ReviewShell
      taskId={taskId}
      fileCount={totalFileCount}
      linesAdded={linesAdded}
      linesRemoved={linesRemoved}
      isLoading={changesLoading || diffLoading}
      isEmpty={totalFileCount === 0}
      allExpanded={collapsedFiles.size === 0}
      onExpandAll={expandAll}
      onCollapseAll={collapseAll}
      onUncollapseFile={uncollapseFile}
    >
      {parsedFiles.map((fileDiff) => {
        const key = fileDiff.name ?? fileDiff.prevName ?? "";
        const isCollapsed = collapsedFiles.has(key);
        const deferredReason = getDeferredReason(key);

        if (deferredReason) {
          const { additions, deletions } = sumHunkStats(fileDiff.hunks);
          return (
            <div key={key} data-file-path={key}>
              <DeferredDiffPlaceholder
                filePath={key}
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
            <RevertableFileDiff
              fileDiff={fileDiff}
              repoPath={repoPath}
              options={{ ...diffOptions, collapsed: isCollapsed }}
              renderCustomHeader={(fd) => (
                <DiffFileHeader
                  fileDiff={fd}
                  collapsed={isCollapsed}
                  onToggle={() => toggleFile(key)}
                  onOpenFile={() =>
                    openFile(taskId, `${repoPath}/${key}`, false)
                  }
                />
              )}
            />
          </div>
        );
      })}
      {untrackedFiles.map((file) => {
        const isCollapsed = collapsedFiles.has(file.path);
        return (
          <div key={file.path} data-file-path={file.path}>
            <UntrackedFileDiff
              file={file}
              repoPath={repoPath}
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

function UntrackedFileDiff({
  file,
  repoPath,
  options,
  collapsed,
  onToggle,
}: {
  file: ChangedFile;
  repoPath: string;
  options: FileDiffOptions<unknown>;
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
