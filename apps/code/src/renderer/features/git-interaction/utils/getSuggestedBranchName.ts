import { deriveBranchName } from "@features/git-interaction/utils/deriveBranchName";
import { trpc } from "@renderer/trpc";
import type { Task } from "@shared/types";
import { queryClient } from "@utils/queryClient";

export function getSuggestedBranchName(
  taskId: string,
  repoPath?: string,
): string {
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
  const base = deriveBranchName(task?.title ?? "", fallbackId);

  if (!repoPath) return base;

  const cached = queryClient.getQueryData<string[]>(
    trpc.git.getAllBranches.queryKey({ directoryPath: repoPath }),
  );
  if (!cached?.includes(base)) return base;

  let n = 2;
  while (cached.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
