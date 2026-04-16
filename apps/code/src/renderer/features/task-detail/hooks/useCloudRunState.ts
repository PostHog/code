import { useSessionForTask } from "@features/sessions/hooks/useSession";
import { useCloudEventSummary } from "@features/task-detail/hooks/useCloudEventSummary";
import { extractCloudToolChangedFiles } from "@features/task-detail/utils/cloudToolChanges";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { ChangedFile, Task } from "@shared/types";
import { useMemo } from "react";

export function useCloudRunState(taskId: string, task: Task) {
  const { data: tasks = [] } = useTasks();
  const freshTask = useMemo(
    () => tasks.find((t) => t.id === taskId) ?? task,
    [tasks, taskId, task],
  );

  const session = useSessionForTask(taskId);

  const rawPrUrl = freshTask.latest_run?.output?.pr_url;
  const prUrl = typeof rawPrUrl === "string" ? rawPrUrl : null;
  const branch = freshTask.latest_run?.branch ?? null;
  const cloudBranch = session?.cloudBranch ?? null;
  const effectiveBranch = branch ?? cloudBranch;
  const repo = freshTask.repository ?? null;

  const cloudStatus =
    session?.cloudStatus ?? freshTask.latest_run?.status ?? null;
  const isRunActive =
    cloudStatus === "queued" ||
    cloudStatus === "in_progress" ||
    (cloudStatus === null && session != null);

  const summary = useCloudEventSummary(taskId);
  const toolCallFiles = useMemo(
    () => extractCloudToolChangedFiles(summary.toolCalls),
    [summary],
  );
  const fallbackFiles: ChangedFile[] =
    summary.treeSnapshotFiles.length > 0
      ? summary.treeSnapshotFiles
      : toolCallFiles;

  return {
    freshTask,
    session,
    prUrl,
    effectiveBranch,
    repo,
    cloudStatus,
    isRunActive,
    fallbackFiles,
  };
}
