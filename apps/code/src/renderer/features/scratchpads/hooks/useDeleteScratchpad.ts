import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { trpc, trpcClient } from "@renderer/trpc";
import {
  type QueryClient,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";

const log = logger.scope("delete-scratchpad");

const UNPUBLISHED_PREFIX = "[UNPUBLISHED] ";

/**
 * Multi-step delete for a draft scratchpad. Every step is best-effort; the user
 * gets a toast describing what failed. Steps:
 *
 *   1. Read manifest (so we know the linked projectId).
 *   2. Kill all running previews for this task.
 *   3. Delete the local scratchpad directory + manifest.
 *   4. Delete the auto-created PostHog project (only if its name still has the
 *      `[UNPUBLISHED] ` prefix; user-picked existing projects are never
 *      deleted).
 *   5. Delete the PostHog task itself.
 *   6. Invalidate the relevant TanStack Query caches.
 */
export async function deleteScratchpadImperative(
  taskId: string,
  posthogClient: PostHogAPIClient,
  queryClient: QueryClient,
): Promise<void> {
  // 1. Read manifest to find projectId before we delete anything else.
  const manifest = await trpcClient.scratchpad.readManifest
    .query({ taskId })
    .catch((err) => {
      log.warn("Failed to read manifest", { taskId, err });
      return null;
    });

  // 2. Kill all running previews for this task. Best-effort.
  await trpcClient.preview.unregister.mutate({ taskId }).catch((err) => {
    log.warn("Failed to unregister previews", { taskId, err });
  });

  // 3. Delete the scratchpad directory + manifest.
  try {
    await trpcClient.scratchpad.delete.mutate({ taskId });
  } catch (err) {
    log.error("Failed to delete scratchpad directory", { taskId, err });
    toast.error("Failed to delete draft files");
  }

  // 4. If the linked PostHog project name still starts with `[UNPUBLISHED] `,
  //    it was auto-created — delete it. User-picked existing projects are
  //    NEVER deleted.
  if (manifest?.projectId != null) {
    const projectId = manifest.projectId;
    const project = await posthogClient.getProject(projectId).catch((err) => {
      log.warn("Failed to fetch project for deletion", { projectId, err });
      return null;
    });
    if (project?.name?.startsWith(UNPUBLISHED_PREFIX)) {
      try {
        await posthogClient.deleteProject(projectId);
      } catch (err) {
        log.warn("Failed to delete auto-created project", { projectId, err });
        toast.error("Failed to delete auto-created PostHog project");
      }
    }
  }

  // 5. Delete the PostHog task.
  try {
    await posthogClient.deleteTask(taskId);
  } catch (err) {
    log.error("Failed to delete PostHog task", { taskId, err });
    toast.error("Failed to delete PostHog task");
  }

  // 6. Invalidate caches.
  void queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });
  void queryClient.invalidateQueries(trpc.scratchpad.list.pathFilter());
}

export function useDeleteScratchpad() {
  const queryClient = useQueryClient();
  const posthogClient = useAuthenticatedClient();

  return useMutation({
    mutationFn: async ({ taskId }: { taskId: string }) => {
      await deleteScratchpadImperative(taskId, posthogClient, queryClient);
    },
  });
}
