import { useSuspendedTaskIds } from "@features/suspension/hooks/useSuspendedTaskIds";
import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";

export function useCwd(taskId: string): string | undefined {
  const workspace = useWorkspace(taskId);
  const suspendedIds = useSuspendedTaskIds();

  if (!workspace) return undefined;
  if (suspendedIds.has(taskId)) return undefined;

  return workspace.worktreePath ?? workspace.folderPath;
}
