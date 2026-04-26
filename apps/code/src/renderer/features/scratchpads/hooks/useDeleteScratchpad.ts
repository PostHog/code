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

/**
 * Multi-step delete for a draft scratchpad. Every step is best-effort; the
 * user gets a toast describing what failed. Steps:
 *
 *   1. Kill all running previews for this task.
 *   2. Delete the local scratchpad directory + manifest.
 *   3. Delete the PostHog task itself.
 *   4. Invalidate the relevant TanStack Query caches.
 *
 * The linked PostHog project (if any) is never touched: drafts only ever
 * reference projects the user explicitly picked, and project linking
 * happens at publish time.
 */
export async function deleteScratchpadImperative(
  taskId: string,
  posthogClient: PostHogAPIClient,
  queryClient: QueryClient,
): Promise<void> {
  await trpcClient.preview.unregister.mutate({ taskId }).catch((err) => {
    log.warn("Failed to unregister previews", { taskId, err });
  });

  try {
    await trpcClient.scratchpad.delete.mutate({ taskId });
  } catch (err) {
    log.error("Failed to delete scratchpad directory", { taskId, err });
    toast.error("Failed to delete draft files");
  }

  try {
    await posthogClient.deleteTask(taskId);
  } catch (err) {
    log.error("Failed to delete PostHog task", { taskId, err });
    toast.error("Failed to delete PostHog task");
  }

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
