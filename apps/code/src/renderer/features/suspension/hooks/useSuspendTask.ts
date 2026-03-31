import { useTerminalStore } from "@features/terminal/stores/terminalStore";
import { workspaceApi } from "@features/workspace/hooks/useWorkspace";
import { trpc, trpcClient } from "@renderer/trpc";
import { useFocusStore } from "@stores/focusStore";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";

const log = logger.scope("suspend-task");

interface SuspendTaskInput {
  taskId: string;
  reason?: "manual" | "max_worktrees" | "inactivity";
}

export function useSuspendTask() {
  const queryClient = useQueryClient();

  const suspendTask = async (input: SuspendTaskInput) => {
    const { taskId, reason = "manual" } = input;
    const focusStore = useFocusStore.getState();
    const workspace = await workspaceApi.get(taskId);

    useTerminalStore.getState().clearTerminalStatesForTask(taskId);

    queryClient.setQueryData<string[]>(
      trpc.suspension.suspendedTaskIds.queryKey(),
      (old) => (old ? [...old, taskId] : [taskId]),
    );

    if (
      workspace?.worktreePath &&
      focusStore.session?.worktreePath === workspace.worktreePath
    ) {
      log.info("Unfocusing workspace before suspending");
      await focusStore.disableFocus();
    }

    try {
      await trpcClient.suspension.suspend.mutate({
        taskId,
        reason,
      });

      queryClient.invalidateQueries(trpc.suspension.pathFilter());
      queryClient.invalidateQueries(trpc.workspace.pathFilter());
    } catch (error) {
      log.error("Failed to suspend task", error);

      queryClient.setQueryData<string[]>(
        trpc.suspension.suspendedTaskIds.queryKey(),
        (old) => (old ? old.filter((id) => id !== taskId) : []),
      );

      throw error;
    }
  };

  return { suspendTask };
}
