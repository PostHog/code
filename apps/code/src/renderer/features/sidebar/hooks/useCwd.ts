import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";

export function useCwd(taskId: string): string | undefined {
  const workspace = useWorkspace(taskId);

  if (!workspace) return undefined;

  return workspace.worktreePath ?? workspace.folderPath;
}
