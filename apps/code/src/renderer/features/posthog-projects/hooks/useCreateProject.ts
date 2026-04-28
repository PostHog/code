import { useAuthenticatedMutation } from "@hooks/useAuthenticatedMutation";
import type { Schemas } from "@renderer/api/generated";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";

const log = logger.scope("posthog-projects");

export interface CreateProjectInput {
  name: string;
  organizationId?: string;
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useAuthenticatedMutation<Schemas.Team, Error, CreateProjectInput>(
    async (client, { name, organizationId }) => {
      let resolvedOrgId = organizationId;
      if (!resolvedOrgId) {
        const user = await client.getCurrentUser();
        const userOrgId = (user as { organization?: { id?: string } | null })
          .organization?.id;
        if (!userOrgId) {
          throw new Error(
            "Cannot create project: current user has no organization",
          );
        }
        resolvedOrgId = userOrgId;
      }

      return await client.createProject({
        name,
        organizationId: resolvedOrgId,
      });
    },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["projects", "list"] });
      },
      onError: (error) => {
        log.error("Failed to create project", error);
      },
    },
  );
}
