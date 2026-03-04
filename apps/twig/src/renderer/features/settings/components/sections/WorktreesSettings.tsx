import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { Trash } from "@phosphor-icons/react";
import { Button, Flex, Skeleton, Text } from "@radix-ui/themes";
import { logger } from "@renderer/lib/logger";
import { useNavigationStore } from "@renderer/stores/navigationStore";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { trpcReact, trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

const log = logger.scope("worktrees-settings");

interface WorktreeGroup {
  folderPath: string;
  worktrees: WorktreeEntry[];
}

interface WorktreeEntry {
  worktreePath: string;
  head: string;
  branch: string | null;
  taskIds: string[];
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / 1024 ** i;
  return `${size.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function WorktreeSize({ worktreePath }: { worktreePath: string }) {
  const { data, isLoading } = trpcReact.workspace.getWorktreeSize.useQuery(
    { worktreePath },
    { staleTime: 60000 },
  );

  if (isLoading) {
    return (
      <>
        {" - "}
        <Skeleton
          style={{ width: "50px", height: "12px", display: "inline-block" }}
        />
      </>
    );
  }

  if (!data) return null;

  return <> - {formatSize(data.sizeBytes)}</>;
}

export function WorktreesSettings() {
  const queryClient = useQueryClient();
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const { mutateAsync: deleteTask } = useDeleteTask();
  const [deletingWorktrees, setDeletingWorktrees] = useState<Set<string>>(
    new Set(),
  );

  const folders = useRegisteredFoldersStore((state) => state.folders);
  const { data: tasks } = useTasks();

  const worktreeQueries = trpcReact.useQueries((t) =>
    folders.map((folder) =>
      t.workspace.listGitWorktrees(
        { mainRepoPath: folder.path },
        { staleTime: 30000 },
      ),
    ),
  );

  const worktreeGroups = useMemo(() => {
    const groups: WorktreeGroup[] = [];

    for (let i = 0; i < folders.length; i++) {
      const folder = folders[i];
      const query = worktreeQueries[i];

      if (!query?.data || query.data.length === 0) continue;

      groups.push({
        folderPath: folder.path,
        worktrees: query.data.map((wt) => ({
          worktreePath: wt.worktreePath,
          head: wt.head,
          branch: wt.branch,
          taskIds: wt.taskIds,
        })),
      });
    }

    return groups.sort((a, b) => a.folderPath.localeCompare(b.folderPath));
  }, [folders, worktreeQueries]);

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    if (tasks) {
      for (const task of tasks) {
        map.set(task.id, task);
      }
    }
    return map;
  }, [tasks]);

  const handleDeleteWorktree = useCallback(
    async (
      worktreePath: string,
      allTaskIds: string[],
      existingTaskIds: string[],
      folderPath: string,
    ) => {
      if (existingTaskIds.length > 0) {
        const result =
          await trpcVanilla.contextMenu.confirmDeleteWorktree.mutate({
            worktreePath,
            linkedTaskCount: existingTaskIds.length,
          });
        if (!result.confirmed) return;
      }

      setDeletingWorktrees((prev) => new Set(prev).add(worktreePath));

      try {
        if (allTaskIds.length > 0) {
          for (const taskId of allTaskIds) {
            await deleteWorkspace(taskId, folderPath);
          }
        } else {
          await trpcVanilla.workspace.deleteWorktree.mutate({
            worktreePath,
            mainRepoPath: folderPath,
          });
        }
        for (const taskId of existingTaskIds) {
          await deleteTask(taskId);
        }
        queryClient.invalidateQueries({
          queryKey: [["workspace", "listGitWorktrees"]],
        });
      } catch (error) {
        log.error("Failed to delete worktree:", error);
      } finally {
        setDeletingWorktrees((prev) => {
          const next = new Set(prev);
          next.delete(worktreePath);
          return next;
        });
      }
    },
    [deleteWorkspace, deleteTask, queryClient],
  );

  const isLoading = worktreeQueries.some((q) => q.isLoading);

  if (isLoading) {
    return (
      <Text size="2" color="gray">
        Loading worktrees...
      </Text>
    );
  }

  if (worktreeGroups.length === 0) {
    return (
      <Text size="1" color="gray">
        Tasks that are run in a worktree will show up here.
      </Text>
    );
  }

  return (
    <Flex direction="column" gap="5">
      {worktreeGroups.map((group) => (
        <WorktreeGroupSection
          key={group.folderPath}
          group={group}
          taskMap={taskMap}
          deletingWorktrees={deletingWorktrees}
          onDelete={handleDeleteWorktree}
        />
      ))}
    </Flex>
  );
}

interface WorktreeGroupSectionProps {
  group: WorktreeGroup;
  taskMap: Map<string, Task>;
  deletingWorktrees: Set<string>;
  onDelete: (
    worktreePath: string,
    allTaskIds: string[],
    existingTaskIds: string[],
    folderPath: string,
  ) => void;
}

function getFolderName(folderPath: string): string {
  const parts = folderPath.split("/");
  return parts[parts.length - 1] || folderPath;
}

function WorktreeGroupSection({
  group,
  taskMap,
  deletingWorktrees,
  onDelete,
}: WorktreeGroupSectionProps) {
  const folderName = getFolderName(group.folderPath);

  return (
    <Flex direction="column">
      <Text size="1" color="gray" mb="2">
        {folderName}
      </Text>
      <Flex direction="column">
        {group.worktrees.map((worktree, index) => (
          <WorktreeRow
            key={worktree.worktreePath}
            worktree={worktree}
            folderPath={group.folderPath}
            taskMap={taskMap}
            isDeleting={deletingWorktrees.has(worktree.worktreePath)}
            onDelete={onDelete}
            isLast={index === group.worktrees.length - 1}
          />
        ))}
      </Flex>
    </Flex>
  );
}

interface WorktreeRowProps {
  worktree: WorktreeEntry;
  folderPath: string;
  taskMap: Map<string, Task>;
  isDeleting: boolean;
  isLast: boolean;
  onDelete: (
    worktreePath: string,
    allTaskIds: string[],
    existingTaskIds: string[],
    folderPath: string,
  ) => void;
}

function getTaskTitle(task: Task): string {
  return task.title || task.description?.slice(0, 50) || task.id;
}

function WorktreeRow({
  worktree,
  folderPath,
  taskMap,
  isDeleting,
  isLast,
  onDelete,
}: WorktreeRowProps) {
  const { close } = useSettingsDialogStore();
  const { navigateToTask } = useNavigationStore();

  const linkedTasks = worktree.taskIds
    .map((id) => taskMap.get(id))
    .filter((task): task is Task => task !== undefined);

  const handleTaskClick = (task: Task) => {
    close();
    navigateToTask(task);
  };

  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      py="3"
      style={{
        borderBottom: isLast ? undefined : "1px solid var(--gray-4)",
      }}
    >
      <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
        <Text size="1" className="font-mono" style={{ wordBreak: "break-all" }}>
          {worktree.worktreePath}
          <WorktreeSize worktreePath={worktree.worktreePath} />
        </Text>
        {linkedTasks.length > 0 ? (
          <Flex gap="1" wrap="wrap">
            {linkedTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => handleTaskClick(task)}
                className="cursor-pointer truncate border-0 bg-transparent p-0 text-left text-[11px] text-gray-10 hover:text-accent-11 hover:underline"
              >
                {getTaskTitle(task)}
              </button>
            ))}
          </Flex>
        ) : (
          <span className="text-[11px] text-gray-10">No linked tasks</span>
        )}
      </Flex>
      <Button
        variant="outline"
        color="red"
        size="1"
        disabled={isDeleting}
        onClick={() =>
          onDelete(
            worktree.worktreePath,
            worktree.taskIds,
            linkedTasks.map((t) => t.id),
            folderPath,
          )
        }
      >
        {isDeleting ? <DotsCircleSpinner size={12} /> : <Trash size={12} />}
        Delete
      </Button>
    </Flex>
  );
}
