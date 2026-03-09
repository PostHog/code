import { useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { trpcReact } from "@renderer/trpc/client";
import type { Task } from "@shared/types";
import { cloneStore } from "@stores/cloneStore";
import { getTaskRepository } from "@utils/repository";
import { useMemo } from "react";

interface UseTaskDataParams {
  taskId: string;
  initialTask: Task;
}

export function useTaskData({ taskId, initialTask }: UseTaskDataParams) {
  const { data: tasks = [] } = useTasks();

  const task = useMemo(
    () => tasks.find((t) => t.id === taskId) || initialTask,
    [tasks, taskId, initialTask],
  );

  const workspace = useWorkspace(taskId);
  const repoPath = workspace?.folderPath ?? null;

  const { data: repoExists } = trpcReact.git.validateRepo.useQuery(
    { directoryPath: repoPath ?? "" },
    { enabled: !!repoPath },
  );

  const repository = getTaskRepository(task);

  const isCloning = cloneStore((state) =>
    repository ? state.isCloning(repository) : false,
  );

  const cloneProgress = cloneStore(
    (state) => {
      if (!repository) return null;
      const cloneOp = state.getCloneForRepo(repository);
      if (!cloneOp?.latestMessage) return null;

      const percentMatch = cloneOp.latestMessage.match(/(\d+)%/);
      const percent = percentMatch ? Number.parseInt(percentMatch[1], 10) : 0;

      return {
        message: cloneOp.latestMessage,
        percent,
      };
    },
    (a, b) => a?.message === b?.message && a?.percent === b?.percent,
  );

  return {
    task,
    repoPath,
    repoExists: repoExists ?? null,
    isCloning,
    cloneProgress,
  };
}
