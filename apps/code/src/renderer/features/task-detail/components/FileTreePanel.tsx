import { TreeDirectoryRow, TreeFileRow } from "@components/TreeDirectoryRow";
import { PanelMessage } from "@components/ui/PanelMessage";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { isFileTabActiveInTree } from "@features/panels/store/panelStoreHelpers";
import {
  selectIsPathExpanded,
  useFileTreeStore,
} from "@features/right-sidebar/stores/fileTreeStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useCloudRunState } from "@features/task-detail/hooks/useCloudRunState";
import { Cloud } from "@phosphor-icons/react";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { toRelativePath } from "@utils/path";

interface FileTreePanelProps {
  taskId: string;
  task: Task;
}

interface DirectoryEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

interface LazyTreeItemProps {
  entry: DirectoryEntry;
  depth: number;
  taskId: string;
  repoPath: string;
  isFileActive: (relativePath: string) => boolean;
  mainRepoPath?: string;
}

function LazyTreeItem({
  entry,
  depth,
  taskId,
  repoPath,
  isFileActive,
  mainRepoPath,
}: LazyTreeItemProps) {
  const isExpanded = useFileTreeStore(selectIsPathExpanded(taskId, entry.path));
  const togglePath = useFileTreeStore((state) => state.togglePath);
  const collapseAll = useFileTreeStore((state) => state.collapseAll);
  const openFileInSplit = usePanelLayoutStore((state) => state.openFileInSplit);
  const workspace = useWorkspace(taskId);
  const trpc = useTRPC();

  const { data: children } = useQuery(
    trpc.fileWatcher.listDirectory.queryOptions(
      { dirPath: entry.path },
      {
        enabled: entry.type === "directory" && isExpanded,
        staleTime: Infinity,
      },
    ),
  );

  const relativePath = toRelativePath(entry.path, repoPath);
  const isActive = entry.type === "file" && isFileActive(relativePath);

  const handleClick = () => {
    if (entry.type === "directory") {
      togglePath(taskId, entry.path);
    } else {
      openFileInSplit(taskId, relativePath);
    }
  };

  const handleDoubleClick = () => {
    if (entry.type === "file") {
      openFileInSplit(taskId, relativePath, false);
    }
  };

  const handleContextMenu = async (e: React.MouseEvent) => {
    e.preventDefault();
    const result = await trpcClient.contextMenu.showFileContextMenu.mutate({
      filePath: entry.path,
      showCollapseAll: true,
    });

    if (!result.action) return;

    if (result.action.type === "collapse-all") {
      collapseAll(taskId);
    } else if (result.action.type === "external-app") {
      await handleExternalAppAction(
        result.action.action,
        entry.path,
        entry.name,
        { workspace, mainRepoPath },
      );
    }
  };

  const isDirectory = entry.type === "directory";

  return (
    <Box>
      {isDirectory ? (
        <Box
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        >
          <TreeDirectoryRow
            name={entry.name}
            depth={depth}
            isExpanded={isExpanded}
            onToggle={handleClick}
          />
        </Box>
      ) : (
        <TreeFileRow
          fileName={entry.name}
          depth={depth}
          isActive={isActive}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onContextMenu={handleContextMenu}
        />
      )}
      {isExpanded &&
        children?.map((child) => (
          <LazyTreeItem
            key={child.path}
            entry={child}
            depth={depth + 1}
            taskId={taskId}
            repoPath={repoPath}
            isFileActive={isFileActive}
            mainRepoPath={mainRepoPath}
          />
        ))}
    </Box>
  );
}

function CloudFileTreePanel({ taskId, task }: FileTreePanelProps) {
  const { prUrl, effectiveBranch, repo, isRunActive, fallbackFiles } =
    useCloudRunState(taskId, task);

  const hasFallbackChanges = fallbackFiles.length > 0;

  if (isRunActive && !hasFallbackChanges) {
    return (
      <PanelMessage detail="Files are in the cloud sandbox">
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Running in cloud...</Text>
        </Flex>
      </PanelMessage>
    );
  }

  const githubUrl = prUrl
    ? `${prUrl}/files`
    : repo && effectiveBranch
      ? `https://github.com/${repo}/tree/${effectiveBranch}`
      : null;

  return (
    <PanelMessage detail="Files are in the cloud sandbox">
      <Flex direction="column" align="center" gap="2">
        <Flex align="center" gap="2">
          <Cloud size={16} weight="regular" />
          <Text size="2">
            {hasFallbackChanges
              ? `${fallbackFiles.length} file${fallbackFiles.length === 1 ? "" : "s"} changed in cloud sandbox`
              : "Files are in the cloud sandbox"}
          </Text>
        </Flex>
        {githubUrl && (
          <Button
            size="1"
            variant="soft"
            onClick={() =>
              trpcClient.os.openExternal.mutate({ url: githubUrl })
            }
          >
            View on GitHub
          </Button>
        )}
      </Flex>
    </PanelMessage>
  );
}

export function FileTreePanel({ taskId, task }: FileTreePanelProps) {
  const workspace = useWorkspace(taskId);
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";

  if (isCloud) {
    return <CloudFileTreePanel taskId={taskId} task={task} />;
  }

  return <LocalFileTreePanel taskId={taskId} task={task} />;
}

function LocalFileTreePanel({ taskId, task: _task }: FileTreePanelProps) {
  const trpc = useTRPC();
  const workspace = useWorkspace(taskId);
  const repoPath = useCwd(taskId);
  const mainRepoPath = workspace?.folderPath;
  const queryClient = useQueryClient();
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));

  const {
    data: rootEntries,
    isLoading,
    error,
  } = useQuery(
    trpc.fileWatcher.listDirectory.queryOptions(
      { dirPath: repoPath as string },
      { enabled: !!repoPath, staleTime: Infinity },
    ),
  );

  useSubscription(
    trpc.fileWatcher.onDirectoryChanged.subscriptionOptions(undefined, {
      enabled: !!repoPath,
      onData: ({ dirPath }) => {
        queryClient.invalidateQueries(
          trpc.fileWatcher.listDirectory.queryFilter({ dirPath }),
        );
      },
    }),
  );

  const isFileActive = (relativePath: string): boolean => {
    if (!layout) return false;
    return isFileTabActiveInTree(layout.panelTree, relativePath);
  };

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading files...</PanelMessage>;
  }

  if (error) {
    return <PanelMessage color="red">Failed to load files</PanelMessage>;
  }

  if (!rootEntries?.length) {
    return <PanelMessage>No files found</PanelMessage>;
  }

  return (
    <Box
      height="100%"
      py="2"
      style={{
        overflowY: "auto",
      }}
    >
      <Flex direction="column">
        {rootEntries.map((entry) => (
          <LazyTreeItem
            key={entry.path}
            entry={entry}
            depth={0}
            taskId={taskId}
            repoPath={repoPath}
            isFileActive={isFileActive}
            mainRepoPath={mainRepoPath}
          />
        ))}
      </Flex>
    </Box>
  );
}
