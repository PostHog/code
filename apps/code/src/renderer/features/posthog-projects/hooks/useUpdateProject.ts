import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import type { Schemas } from "@renderer/api/generated";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";

const log = logger.scope("posthog-projects");

export interface UpdateProjectInput {
  projectId: number;
  patch: { name?: string };
}

export function useUpdateProject() {
  const queryClient = useQueryClient();

  return useAuthenticatedMutation<Schemas.Team, Error, UpdateProjectInput>(
    (client, { projectId, patch }) => client.updateProject(projectId, patch),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      },
      onError: (error) => {
        log.error("Failed to update project", error);
      },
    },
  );
}
