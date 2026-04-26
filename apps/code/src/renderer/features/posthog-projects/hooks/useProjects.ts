import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { Schemas } from "@renderer/api/generated";

/**
 * Lists PostHog projects in the current user's organization.
 *
 * Resolves the org id from `getCurrentUser()` lazily (no separate hook
 * dependency) so a single call yields a usable list.
 */
export function useProjects() {
  return useAuthenticatedQuery<Schemas.Team[]>(
    ["projects", "list", "current-org"],
    async (client) => {
      const user = await client.getCurrentUser();
      const orgId = (user as { organization?: { id?: string } | null })
        .organization?.id;
      if (!orgId) return [];
      return await client.listProjects(orgId);
    },
  );
}
