import { useAuthenticatedClient } from "@hooks/useAuthenticatedClient";
import type {
  PublishResult,
  PublishVisibility,
} from "@main/services/scratchpad/schemas";
import { trpc, trpcClient } from "@renderer/trpc";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";

const log = logger.scope("publish-scratchpad");

export interface PublishScratchpadInput {
  taskId: string;
  repoName: string;
  visibility: PublishVisibility;
}

export type PublishScratchpadResult =
  | { kind: "success"; result: Extract<PublishResult, { success: true }> }
  | { kind: "no_project_linked"; message: string }
  | { kind: "project_inaccessible"; message: string }
  | { kind: "failure"; result: Extract<PublishResult, { success: false }> };

/**
 * Multi-step publish flow:
 *
 *   1. Read the manifest to find `projectId`. The dialog links a project
 *      before calling this hook when the manifest's `projectId` was null.
 *   2. Project access pre-flight: fetch the linked PostHog project. If
 *      inaccessible (deleted, no permissions), surface a recovery error
 *      before hitting GitHub.
 *   3. Call the service's `scratchpad.publish` mutation (creates GitHub
 *      repo, pushes initial commit, patches manifest).
 *   4. Invalidate caches.
 */
export function usePublishScratchpad() {
  const posthogClient = useAuthenticatedClient();
  const queryClient = useQueryClient();

  return useMutation<PublishScratchpadResult, Error, PublishScratchpadInput>({
    mutationFn: async ({ taskId, repoName, visibility }) => {
      const manifest = await trpcClient.scratchpad.readManifest.query({
        taskId,
      });

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

      const result = await trpcClient.scratchpad.publish.mutate({
        taskId,
        repoName,
        visibility,
      });

      if (!result.success) {
        return { kind: "failure", result };
      }

      void queryClient.invalidateQueries(trpc.scratchpad.list.pathFilter());
      void queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });

      return { kind: "success", result };
    },
  });
}
