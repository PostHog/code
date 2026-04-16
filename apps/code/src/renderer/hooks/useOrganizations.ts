import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useCurrentUser } from "@features/auth/hooks/authQueries";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { useMemo } from "react";

export interface OrgInfo {
  id: string;
  name: string;
  slug: string;
}

const organizationKeys = {
  all: ["organizations"] as const,
  list: () => [...organizationKeys.all, "list"] as const,
};

async function fetchOrgs(client: PostHogAPIClient): Promise<OrgInfo[]> {
  const user = await client.getCurrentUser();
  return (user.organizations ?? []).map(
    (org: { id: string; name: string; slug: string }) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
    }),
  );
}

export function useOrganizations() {
  const client = useOptionalAuthenticatedClient();
  const { data: currentUser } = useCurrentUser({ client });

  const {
    data: orgs,
    isLoading,
    error,
  } = useAuthenticatedQuery(
    organizationKeys.list(),
    (client) => fetchOrgs(client),
    { staleTime: 5 * 60 * 1000 },
  );

  const effectiveSelectedOrgId = useMemo(() => {
    if (!orgs?.length) return null;

    const userCurrentOrgId = currentUser?.organization?.id;
    if (userCurrentOrgId && orgs.some((org) => org.id === userCurrentOrgId)) {
      return userCurrentOrgId;
    }

    return orgs[0].id;
  }, [currentUser?.organization?.id, orgs]);

  const sortedOrgs = useMemo(() => {
    return [...(orgs ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  }, [orgs]);

  return {
    orgs: sortedOrgs,
    effectiveSelectedOrgId,
    isLoading,
    error,
  };
}
