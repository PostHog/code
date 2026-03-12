import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { CodeMirrorEditor } from "@features/code-editor/components/CodeMirrorEditor";
import { getRelativePath } from "@features/code-editor/utils/pathUtils";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { Box } from "@radix-ui/themes";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

interface DiffEditorPanelProps {
  taskId: string;
  task: Task;
  absolutePath: string;
}

export function DiffEditorPanel({
  taskId,
  task: _task,
  absolutePath,
}: DiffEditorPanelProps) {
  const trpc = useTRPC();
  const repoPath = useCwd(taskId);
  const filePath = getRelativePath(absolutePath, repoPath);
  const queryClient = useQueryClient();
  const closeDiffTabsForFile = usePanelLayoutStore(
    (s) => s.closeDiffTabsForFile,
  );

  const { data: changedFiles = [], isLoading: loadingChangelist } = useQuery(
    trpc.git.getChangedFilesHead.queryOptions(
      { directoryPath: repoPath as string },
      { enabled: !!repoPath, staleTime: 30_000 },
    ),
  );

  const fileInfo = changedFiles.find((f) => f.path === filePath);
  const isFileStillChanged = !!fileInfo;
  const status = fileInfo?.status ?? "modified";
  const originalPath = fileInfo?.originalPath ?? filePath;
  const isDeleted = status === "deleted";
  const isNew = status === "untracked" || status === "added";

  const { data: modifiedContent, isLoading: loadingModified } = useQuery(
    trpc.fs.readRepoFile.queryOptions(
      { repoPath: repoPath as string, filePath },
      { enabled: !!repoPath && !isDeleted, staleTime: 30_000 },
    ),
  );

  const { data: originalContent, isLoading: loadingOriginal } = useQuery(
    trpc.git.getFileAtHead.queryOptions(
      { directoryPath: repoPath as string, filePath: originalPath },
      { enabled: !!repoPath && !isNew, staleTime: 30_000 },
    ),
  );

  const handleRefresh = useCallback(() => {
    if (!repoPath) return;
    queryClient.invalidateQueries(
      trpc.fs.readRepoFile.queryFilter({ repoPath, filePath }),
    );
    queryClient.invalidateQueries(trpc.git.getFileAtHead.pathFilter());
    queryClient.invalidateQueries(
      trpc.git.getChangedFilesHead.queryFilter({ directoryPath: repoPath }),
    );
  }, [repoPath, filePath, queryClient, trpc]);

  const handleContentChange = useCallback(
    async (newContent: string) => {
      if (!repoPath) return;

      try {
        await trpcClient.fs.writeRepoFile.mutate({
          repoPath,
          filePath,
          content: newContent,
        });

        queryClient.invalidateQueries(
          trpc.fs.readRepoFile.queryFilter({ repoPath, filePath }),
        );
        queryClient.invalidateQueries(
          trpc.git.getChangedFilesHead.queryFilter({ directoryPath: repoPath }),
        );
      } catch (_error) {}
    },
    [repoPath, filePath, queryClient, trpc],
  );

  const isLoading =
    loadingChangelist ||
    (!isDeleted && loadingModified) ||
    (!isNew && loadingOriginal);

  const hasNoChanges =
    !!repoPath &&
    !isLoading &&
    (!isFileStillChanged ||
      (!isDeleted && !isNew && originalContent === modifiedContent));

  useEffect(() => {
    if (hasNoChanges) {
      closeDiffTabsForFile(taskId, filePath);
    }
  }, [hasNoChanges, closeDiffTabsForFile, taskId, filePath]);

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading diff...</PanelMessage>;
  }

  if (hasNoChanges) {
    return null;
  }

  const showDiff = !isDeleted && !isNew;
  const content = isDeleted ? originalContent : modifiedContent;

  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      {showDiff ? (
        <CodeMirrorDiffEditor
          originalContent={originalContent ?? ""}
          modifiedContent={modifiedContent ?? ""}
          filePath={absolutePath}
          relativePath={filePath}
          onContentChange={handleContentChange}
          onRefresh={handleRefresh}
        />
      ) : (
        <CodeMirrorEditor
          content={content ?? ""}
          filePath={absolutePath}
          relativePath={filePath}
          readOnly
        />
      )}
    </Box>
  );
}
