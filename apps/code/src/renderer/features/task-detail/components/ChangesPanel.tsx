import { PanelMessage } from "@components/ui/PanelMessage";
import {
  useCloudBranchChangedFiles,
  useCloudPrChangedFiles,
  useGitQueries,
} from "@features/git-interaction/hooks/useGitQueries";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import {
  isCloudDiffTabActiveInTree,
  isDiffTabActiveInTree,
} from "@features/panels/store/panelStoreHelpers";
import { usePendingPermissionsForTask } from "@features/sessions/stores/sessionStore";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { ChangesCloudFileRow } from "@features/task-detail/components/ChangesCloudFileRow";
import { ChangesLocalFileRow } from "@features/task-detail/components/ChangesLocalFileRow";
import { useCloudRunState } from "@features/task-detail/hooks/useCloudRunState";
import { getCloudChangesState } from "@features/task-detail/utils/getCloudChangesState";
import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";
import type { ChangedFile, Task } from "@shared/types";
import { useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

interface ChangesPanelProps {
  taskId: string;
  task: Task;
}

function CloudChangesPanel({ taskId, task }: ChangesPanelProps) {
  const { prUrl, effectiveBranch, repo, isRunActive, fallbackFiles } =
    useCloudRunState(taskId, task);

  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));

  const isFileActive = (file: ChangedFile): boolean => {
    if (!layout) return false;
    return isCloudDiffTabActiveInTree(layout.panelTree, file.path, file.status);
  };

  const {
    data: prFiles,
    isPending: prPending,
    isError: prError,
  } = useCloudPrChangedFiles(prUrl);

  const {
    data: branchFiles,
    isPending: branchPending,
    isError: branchError,
  } = useCloudBranchChangedFiles(
    !prUrl ? repo : null,
    !prUrl ? effectiveBranch : null,
  );

  const changedFiles = prUrl ? (prFiles ?? []) : (branchFiles ?? []);
  const isLoading = prUrl ? prPending : effectiveBranch ? branchPending : false;
  const hasError = prUrl ? prError : effectiveBranch ? branchError : false;
  const effectiveFiles = changedFiles.length > 0 ? changedFiles : fallbackFiles;

  const cloudChangesState = getCloudChangesState({
    prUrl,
    effectiveBranch,
    isRunActive,
    effectiveFiles,
    isLoading,
    hasError,
  });

  if (cloudChangesState.kind === "waiting") {
    return (
      <PanelMessage detail={cloudChangesState.detail}>
        <Flex align="center" gap="2">
          <Spinner size="1" />
          <Text size="2">Waiting for changes...</Text>
        </Flex>
      </PanelMessage>
    );
  }

  if (cloudChangesState.kind === "loading") {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  if (cloudChangesState.kind === "pr_error") {
    return (
      <PanelMessage>
        <Flex direction="column" align="center" gap="2">
          <Text>Could not load file changes</Text>
          <Button size="1" variant="soft" asChild>
            <a
              href={cloudChangesState.prUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              View on GitHub
            </a>
          </Button>
        </Flex>
      </PanelMessage>
    );
  }

  if (cloudChangesState.kind === "empty") {
    return <PanelMessage>{cloudChangesState.message}</PanelMessage>;
  }

  return (
    <Box height="100%" overflowY="auto" py="2">
      <Flex direction="column">
        {effectiveFiles.map((file) => (
          <ChangesCloudFileRow
            key={file.path}
            file={file}
            taskId={taskId}
            isActive={isFileActive(file)}
          />
        ))}
        {isRunActive && (
          <Flex align="center" gap="2" px="3" py="2">
            <Spinner size="1" />
            <Text size="1" color="gray">
              Agent is still running...
            </Text>
          </Flex>
        )}
      </Flex>
    </Box>
  );
}

export function ChangesPanel({ taskId, task }: ChangesPanelProps) {
  const workspace = useWorkspace(taskId);
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";

  if (isCloud) {
    return <CloudChangesPanel taskId={taskId} task={task} />;
  }

  return <LocalChangesPanel taskId={taskId} task={task} />;
}

function LocalChangesPanel({ taskId, task: _task }: ChangesPanelProps) {
  const workspace = useWorkspace(taskId);
  const repoPath = useCwd(taskId);
  const layout = usePanelLayoutStore((state) => state.getLayout(taskId));
  const openDiffByMode = usePanelLayoutStore((state) => state.openDiffByMode);
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const hasPendingPermissions = pendingPermissions.size > 0;

  const { changedFiles, changesLoading: isLoading } = useGitQueries(repoPath);

  const getActiveIndex = useCallback((): number => {
    if (!layout) return -1;
    return changedFiles.findIndex((file) =>
      isDiffTabActiveInTree(layout.panelTree, file.path, file.status),
    );
  }, [layout, changedFiles]);

  const handleKeyNavigation = useCallback(
    (direction: "up" | "down") => {
      if (changedFiles.length === 0) return;

      const currentIndex = getActiveIndex();
      const startIndex =
        currentIndex === -1
          ? direction === "down"
            ? -1
            : changedFiles.length
          : currentIndex;
      const newIndex =
        direction === "up"
          ? Math.max(0, startIndex - 1)
          : Math.min(changedFiles.length - 1, startIndex + 1);

      const file = changedFiles[newIndex];
      if (file) {
        openDiffByMode(taskId, file.path, file.status);
      }
    },
    [changedFiles, getActiveIndex, openDiffByMode, taskId],
  );

  useHotkeys(
    "up",
    () => handleKeyNavigation("up"),
    { enabled: !hasPendingPermissions },
    [handleKeyNavigation, hasPendingPermissions],
  );
  useHotkeys(
    "down",
    () => handleKeyNavigation("down"),
    { enabled: !hasPendingPermissions },
    [handleKeyNavigation, hasPendingPermissions],
  );

  const isFileActive = (file: ChangedFile): boolean => {
    if (!layout) return false;
    return isDiffTabActiveInTree(layout.panelTree, file.path, file.status);
  };

  if (!repoPath) {
    return <PanelMessage>No repository path available</PanelMessage>;
  }

  if (isLoading) {
    return <PanelMessage>Loading changes...</PanelMessage>;
  }

  if (changedFiles.length === 0) {
    return (
      <Box height="100%" overflowY="auto" py="2">
        <Flex direction="column" height="100%">
          <PanelMessage>No file changes yet</PanelMessage>
        </Flex>
      </Box>
    );
  }

  return (
    <Box height="100%" overflowY="auto" py="2">
      <Flex direction="column">
        {changedFiles.map((file) => (
          <ChangesLocalFileRow
            key={file.path}
            file={file}
            taskId={taskId}
            repoPath={repoPath}
            isActive={isFileActive(file)}
            mainRepoPath={workspace?.folderPath}
          />
        ))}
        <Flex align="center" justify="center" gap="1" py="2">
          <CaretUpIcon size={12} color="var(--gray-10)" />
          <Text size="1" className="text-gray-10">
            /
          </Text>
          <CaretDownIcon size={12} color="var(--gray-10)" />
          <Text size="1" className="text-gray-10" ml="1">
            to switch files
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}
