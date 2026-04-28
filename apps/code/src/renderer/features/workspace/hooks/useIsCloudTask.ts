import { useWorkspace } from "./useWorkspace";

export function useIsCloudTask(taskId: string): boolean {
  const workspace = useWorkspace(taskId);
  return workspace?.mode === "cloud";
}
