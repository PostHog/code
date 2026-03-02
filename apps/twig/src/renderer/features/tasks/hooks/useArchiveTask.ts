import { getSessionService } from "@features/sessions/service/service";
import { usePinnedTasksStore } from "@features/sidebar/stores/pinnedTasksStore";
import { useTerminalStore } from "@features/terminal/stores/terminalStore";
import { useWorkspaceStore } from "@features/workspace/stores/workspaceStore";
import { logger } from "@renderer/lib/logger";
import { trpcVanilla } from "@renderer/trpc";
import { useFocusStore } from "@stores/focusStore";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
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
    const workspaceStore = useWorkspaceStore.getState();
    const workspace = workspaceStore.workspaces[taskId];

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

      workspaceStore.removeWorkspace(taskId);
      usePinnedTasksStore.getState().unpin(taskId);
      useTerminalStore.getState().clearTerminalStatesForTask(taskId);

      const nav = useNavigationStore.getState();
      if (nav.view.type === "task-detail" && nav.view.data?.id === taskId) {
        nav.navigateToTaskInput();
      }

      queryClient.invalidateQueries({
        queryKey: [["archive"]],
      });

      toast.success("Task archived");
    } catch (error) {
      log.error("Failed to archive task", error);
      toast.error("Failed to archive task");
      throw error;
    }
  };

  return { archiveTask };
}
