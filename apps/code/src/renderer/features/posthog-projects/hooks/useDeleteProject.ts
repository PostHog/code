import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";

const log = logger.scope("posthog-projects");

export interface DeleteProjectInput {
  projectId: number;
}

/**
 * Inspect a fetcher error and return the HTTP status code if the error message
 * follows the `Failed request: [STATUS] ...` shape produced by `buildApiFetcher`.
 */
function extractStatusCode(error: unknown): number | null {
  if (!(error instanceof Error)) return null;
  const match = error.message.match(/Failed request:\s*\[(\d{3})\]/);
  if (!match) return null;
  return Number.parseInt(match[1] ?? "", 10) || null;
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useAuthenticatedMutation<void, Error, DeleteProjectInput>(
    async (client, { projectId }) => {
      try {
        await client.deleteProject(projectId);
      } catch (error) {
        const status = extractStatusCode(error);
        if (status === 404) {
          // Project is already gone — treat as success (e.g. saga rollback,
          // double-delete via Trash).
          log.info("Delete returned 404, treating as success", { projectId });
          return;
        }
        if (status === 403) {
          throw new Error("Insufficient permissions to delete this project", {
            cause: error,
          });
        }
        throw error;
      }
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      },
      onError: (error) => {
        log.error("Failed to delete project", error);
      },
    },
  );
}
