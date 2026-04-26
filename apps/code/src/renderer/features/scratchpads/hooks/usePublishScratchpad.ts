import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import type {
  PublishResult,
  PublishVisibility,
} from "@main/services/scratchpad/schemas";
import { trpc, trpcClient } from "@renderer/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { toast } from "@utils/toast";

const log = logger.scope("publish-scratchpad");

const UNPUBLISHED_PREFIX = "[UNPUBLISHED] ";

export interface PublishScratchpadInput {
  taskId: string;
  repoName: string;
  visibility: PublishVisibility;
  /** Final product name to set on the PostHog project (drops the `[UNPUBLISHED] ` prefix). */
  productName: string;
}

export type PublishScratchpadResult =
  | { kind: "success"; result: Extract<PublishResult, { success: true }> }
  | { kind: "no_project_linked"; message: string }
  | { kind: "project_inaccessible"; message: string }
  | { kind: "failure"; result: Extract<PublishResult, { success: false }> };

/**
 * Multi-step publish flow:
 *
 *   1. Read the manifest to find `projectId`.
 *   2. Project access pre-flight: fetch the linked PostHog project. If
 *      inaccessible (deleted, no permissions), surface a recovery error before
 *      hitting GitHub.
 *   3. Call the service's `scratchpad.publish` mutation (creates GitHub repo,
 *      pushes initial commit, patches manifest).
 *   4. Best-effort PostHog project rename: drop the `[UNPUBLISHED] ` prefix.
 *      A rename failure does NOT undo the publish — it surfaces as a warning
 *      toast and the user can retry from project settings.
 *   5. Invalidate caches.
 */
export function usePublishScratchpad() {
  const posthogClient = useAuthenticatedClient();
  const queryClient = useQueryClient();

  return useMutation<PublishScratchpadResult, Error, PublishScratchpadInput>({
    mutationFn: async ({ taskId, repoName, visibility, productName }) => {
      // 1. Read manifest.
      const manifest = await trpcClient.scratchpad.readManifest.query({
        taskId,
      });

      // 2. Project access pre-flight. Skipped when the user opted out of
      //    linking a project at scratchpad creation time — they need to link
      //    one before they can publish.
      if (manifest.projectId === null) {
        return {
          kind: "no_project_linked",
          message:
            "This scratchpad isn't linked to a PostHog project. Link one before publishing so analytics, replay, and error tracking work in production.",
        };
      }

      const projectId = manifest.projectId;
      const project = await posthogClient.getProject(projectId).catch((err) => {
        log.warn("Failed to fetch project during publish pre-flight", {
          projectId,
          err,
        });
        return null;
      });
      if (!project) {
        return {
          kind: "project_inaccessible",
          message:
            "The linked PostHog project is no longer accessible. Relink to a new project before publishing.",
        };
      }

      // 3. Service-side publish.
      const result = await trpcClient.scratchpad.publish.mutate({
        taskId,
        repoName,
        visibility,
      });

      if (!result.success) {
        return { kind: "failure", result };
      }

      // 4. PostHog project rename — best-effort.
      const targetName = productName.startsWith(UNPUBLISHED_PREFIX)
        ? productName.slice(UNPUBLISHED_PREFIX.length)
        : productName;
      try {
        await posthogClient.updateProject(projectId, {
          name: targetName,
        });
      } catch (err) {
        log.warn("PostHog project rename failed", {
          projectId,
          err,
        });
        toast.warning("Repo published, project rename failed", {
          description: "Try again from project settings.",
        });
      }

      // 5. Invalidate caches.
      void queryClient.invalidateQueries(trpc.scratchpad.list.pathFilter());
      void queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });

      return { kind: "success", result };
    },
  });
}
