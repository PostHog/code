import { useSessionForTask } from "@features/sessions/hooks/useSession";
import type { AgentSession } from "@features/sessions/stores/sessionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { Task } from "@shared/types";

/**
 * Extracts the PR URL from a task and/or session. The URL can arrive via the
 * persisted TaskRun output or the live session's cloudOutput (pushed over SSE
 * while the run is active), so both sources are consulted.
 */
export function resolveCloudPrUrl(
  task: Task | undefined,
  session: AgentSession | undefined,
): string | null {
  const taskPrUrl = task?.latest_run?.output?.pr_url;
  const sessionPrUrl = session?.cloudOutput?.pr_url;

  if (typeof taskPrUrl === "string" && taskPrUrl) return taskPrUrl;
  if (typeof sessionPrUrl === "string" && sessionPrUrl) return sessionPrUrl;
  return null;
}

/** Hook wrapper for components that don't already have the task/session. */
export function useCloudPrUrl(taskId: string): string | null {
  const { data: tasks = [] } = useTasks();
  const task = tasks.find((t) => t.id === taskId);
  const session = useSessionForTask(taskId);
  return resolveCloudPrUrl(task, session);
}
