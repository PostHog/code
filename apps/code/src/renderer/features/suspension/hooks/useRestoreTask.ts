import {
  invalidateGitBranchQueries,
  invalidateGitWorkingTreeQueries,
} from "@features/git-interaction/utils/gitCacheKeys";
import { workspaceApi } from "@features/workspace/hooks/useWorkspace";
import { trpc, trpcClient } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";
import { useState } from "react";

const log = logger.scope("restore-task");

export function useRestoreTask() {
  const queryClient = useQueryClient();
  const [isRestoring, setIsRestoring] = useState(false);

  const restoreTask = async (taskId: string, recreateBranch?: boolean) => {
    setIsRestoring(true);

    try {
      const result = await trpcClient.suspension.restore.mutate({
        taskId,
        recreateBranch,
      });

      queryClient.invalidateQueries(trpc.suspension.pathFilter());
      queryClient.invalidateQueries(trpc.workspace.pathFilter());

      const workspace = await workspaceApi.get(taskId);
      const repoPath = workspace?.worktreePath ?? workspace?.folderPath;
      if (repoPath) {
        invalidateGitWorkingTreeQueries(repoPath);
        invalidateGitBranchQueries(repoPath);
      }

      log.info("Task restored", {
        taskId,
        worktreeName: result.worktreeName,
      });

      return result;
    } catch (error) {
      log.error("Failed to restore task", error);

      const message =
        error instanceof Error ? error.message : "Failed to restore worktree";

      if (message.includes("is already used by worktree")) {
        toast.error(
          "Branch is in use by another worktree. Try restoring with a new branch.",
        );
      } else {
        toast.error(message);
      }

      throw error;
    } finally {
      setIsRestoring(false);
    }
  };

  return { restoreTask, isRestoring };
}
