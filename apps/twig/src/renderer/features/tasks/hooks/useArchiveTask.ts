import { getSessionService } from "@features/sessions/service/service";
import { pinnedTasksApi } from "@features/sidebar/hooks/usePinnedTasks";
import { useTerminalStore } from "@features/terminal/stores/terminalStore";
import { workspaceApi } from "@features/workspace/hooks/useWorkspace";
import { trpcVanilla } from "@renderer/trpc";
import type { ArchivedTask } from "@shared/types/archive";
import { useFocusStore } from "@stores/focusStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";

const log = logger.scope("archive-task");

interface ArchiveTaskInput {
  taskId: string;
}

export function useArchiveTask() {
  const queryClient = useQueryClient();

  const archiveTask = async (input: ArchiveTaskInput) => {
    const { taskId } = input;
    const focusStore = useFocusStore.getState();
    const workspace = await workspaceApi.get(taskId);
    const pinnedTaskIds = await pinnedTasksApi.getPinnedTaskIds();
    const wasPinned = pinnedTaskIds.includes(taskId);

    const nav = useNavigationStore.getState();
    if (nav.view.type === "task-detail" && nav.view.data?.id === taskId) {
      nav.navigateToTaskInput();
    }

    pinnedTasksApi.unpin(taskId);
    useTerminalStore.getState().clearTerminalStatesForTask(taskId);

    queryClient.setQueryData<string[]>(
      [["archive", "archivedTaskIds"], { type: "query" }],
      (old) => (old ? [...old, taskId] : [taskId]),
    );

    const optimisticArchived: ArchivedTask = {
      taskId,
      archivedAt: new Date().toISOString(),
      folderId: workspace?.folderId ?? "",
      mode: workspace?.mode ?? "worktree",
      worktreeName: workspace?.worktreeName ?? null,
      branchName: workspace?.branchName ?? null,
      checkpointId: null,
    };
    queryClient.setQueryData<ArchivedTask[]>(
      [["archive", "list"], { type: "query" }],
      (old) => (old ? [...old, optimisticArchived] : [optimisticArchived]),
    );

    if (
      workspace?.worktreePath &&
      focusStore.session?.worktreePath === workspace.worktreePath
    ) {
      log.info("Unfocusing workspace before archiving");
      await focusStore.disableFocus();
    }

    try {
      await getSessionService().disconnectFromTask(taskId);

      await trpcVanilla.archive.archive.mutate({
        taskId,
      });

      queryClient.invalidateQueries({
        queryKey: [["archive"]],
      });

      toast.success("Task archived");
    } catch (error) {
      log.error("Failed to archive task", error);
      toast.error("Failed to archive task");

      queryClient.setQueryData<string[]>(
        [["archive", "archivedTaskIds"], { type: "query" }],
        (old) => (old ? old.filter((id) => id !== taskId) : []),
      );
      queryClient.setQueryData<ArchivedTask[]>(
        [["archive", "list"], { type: "query" }],
        (old) => (old ? old.filter((a) => a.taskId !== taskId) : []),
      );
      if (wasPinned) {
        pinnedTasksApi.togglePin(taskId);
      }

      throw error;
    }
  };

  return { archiveTask };
}
