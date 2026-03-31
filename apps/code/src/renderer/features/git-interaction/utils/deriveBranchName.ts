import type { Task } from "@shared/types";
import { queryClient } from "@utils/queryClient";

export function deriveBranchName(title: string, fallbackId: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

  if (!slug) return `posthog/task-${fallbackId}`;
  return `posthog/${slug}`;
}

export function getSuggestedBranchName(taskId: string): string {
  const queries = queryClient.getQueriesData<Task[]>({
    queryKey: ["tasks", "list"],
  });
  let task: Task | undefined;
  for (const [, tasks] of queries) {
    task = tasks?.find((t) => t.id === taskId);
    if (task) break;
  }
  const fallbackId = task?.task_number
    ? String(task.task_number)
    : (task?.slug ?? taskId);
  return deriveBranchName(task?.title ?? "", fallbackId);
}
