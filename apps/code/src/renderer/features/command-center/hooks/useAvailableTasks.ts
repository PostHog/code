import { useArchivedTaskIds } from "@features/archive/hooks/useArchivedTaskIds";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspaces } from "@features/workspace/hooks/useWorkspace";
import type { Task } from "@shared/types";
import { useMemo } from "react";
import { useCommandCenterStore } from "../stores/commandCenterStore";

export function useAvailableTasks(): Task[] {
  const { data: tasks = [] } = useTasks();
  const cells = useCommandCenterStore((s) => s.cells);
  const archivedTaskIds = useArchivedTaskIds();
  const { data: workspaces } = useWorkspaces();

  return useMemo(() => {
    const assignedIds = new Set(cells.filter(Boolean));
    return tasks.filter(
      (task) =>
        !assignedIds.has(task.id) &&
        !archivedTaskIds.has(task.id) &&
        workspaces?.[task.id],
    );
  }, [tasks, cells, archivedTaskIds, workspaces]);
}
