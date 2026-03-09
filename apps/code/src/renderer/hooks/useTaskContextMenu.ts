import { useArchiveTask } from "@features/tasks/hooks/useArchiveTask";
import { useDeleteTask } from "@features/tasks/hooks/useTasks";
import { workspaceApi } from "@features/workspace/hooks/useWorkspace";
import { trpcVanilla } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { handleExternalAppAction } from "@utils/handleExternalAppAction";
import { logger } from "@utils/logger";
import { useCallback, useState } from "react";

const log = logger.scope("context-menu");

export function useTaskContextMenu() {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const { deleteWithConfirm } = useDeleteTask();
  const { archiveTask } = useArchiveTask();

  const showContextMenu = useCallback(
    async (
      task: Task,
      event: React.MouseEvent,
      options?: {
        worktreePath?: string;
        isPinned?: boolean;
        onTogglePin?: () => void;
      },
    ) => {
      event.preventDefault();
      event.stopPropagation();

      const { worktreePath, isPinned, onTogglePin } = options ?? {};

      try {
        const result = await trpcVanilla.contextMenu.showTaskContextMenu.mutate(
          {
            taskTitle: task.title,
            worktreePath,
            isPinned,
          },
        );

        if (!result.action) return;

        switch (result.action.type) {
          case "rename":
            setEditingTaskId(task.id);
            break;
          case "pin":
            onTogglePin?.();
            break;
          case "archive":
            await archiveTask({ taskId: task.id });
            break;
          case "delete":
            await deleteWithConfirm({
              taskId: task.id,
              taskTitle: task.title,
              hasWorktree: !!worktreePath,
            });
            break;
          case "external-app":
            if (worktreePath) {
              const workspace = await workspaceApi.get(task.id);
              await handleExternalAppAction(
                result.action.action,
                worktreePath,
                task.title,
                {
                  workspace,
                  mainRepoPath: workspace?.folderPath,
                },
              );
            }
            break;
        }
      } catch (error) {
        log.error("Failed to show context menu", error);
      }
    },
    [deleteWithConfirm, archiveTask],
  );

  return {
    showContextMenu,
    editingTaskId,
    setEditingTaskId,
  };
}
