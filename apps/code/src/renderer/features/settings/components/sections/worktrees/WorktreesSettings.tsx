import { useFolders } from "@features/folders/hooks/useFolders";
import { useDeleteTask, useTasks } from "@features/tasks/hooks/useTasks";
import { Flex, Text } from "@radix-ui/themes";
import { trpcClient, useTRPC } from "@renderer/trpc";
import type { Task } from "@shared/types";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { useCallback, useMemo, useState } from "react";
import type { WorktreeGroup } from "./WorktreeGroupSection";
import { WorktreeGroupSection } from "./WorktreeGroupSection";

const log = logger.scope("worktrees-settings");

export function WorktreesSettings() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const deleteWorkspaceMutation = useMutation(
    trpc.workspace.delete.mutationOptions(),
  );
  const { mutateAsync: deleteTask } = useDeleteTask();
  const [deletingWorktrees, setDeletingWorktrees] = useState<Set<string>>(
    new Set(),
  );

  const { folders } = useFolders();
  const { data: tasks } = useTasks();

  const worktreeQueries = useQueries({
    queries: folders.map((folder) =>
      trpc.workspace.listGitWorktrees.queryOptions(
        { mainRepoPath: folder.path },
        { staleTime: 30_000 },
      ),
    ),
  });

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
          await trpcClient.contextMenu.confirmDeleteWorktree.mutate({
            worktreePath,
            linkedTaskCount: existingTaskIds.length,
          });
        if (!result.confirmed) return;
      }

      setDeletingWorktrees((prev) => new Set(prev).add(worktreePath));

      try {
        if (allTaskIds.length > 0) {
          for (const taskId of allTaskIds) {
            await deleteWorkspaceMutation.mutateAsync({
              taskId,
              mainRepoPath: folderPath,
            });
          }
        } else {
          await trpcClient.workspace.deleteWorktree.mutate({
            worktreePath,
            mainRepoPath: folderPath,
          });
        }

        for (const taskId of existingTaskIds) {
          await deleteTask(taskId);
        }

        await Promise.all([
          queryClient.invalidateQueries(trpc.workspace.getAll.pathFilter()),
          queryClient.invalidateQueries(
            trpc.workspace.listGitWorktrees.queryFilter({
              mainRepoPath: folderPath,
            }),
          ),
        ]);
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
    [deleteWorkspaceMutation, deleteTask, queryClient, trpc],
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
