import { useAuthStore } from "@features/auth/stores/authStore";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import { useMemo } from "react";

export interface OrgWithBilling {
  id: string;
  name: string;
  slug: string;
  has_active_subscription: boolean;
  customer_id: string | null;
}

const organizationKeys = {
  all: ["organizations"] as const,
  withBilling: () => [...organizationKeys.all, "withBilling"] as const,
};

async function fetchOrgsWithBilling(
  client: PostHogAPIClient,
): Promise<OrgWithBilling[]> {
  // Get orgs from the @me endpoint (currentUser.organizations)
  // instead of /api/organizations/ which requires higher privileges
  const user = await client.getCurrentUser();
  const orgs: Array<{ id: string; name: string; slug: string }> = (
    user.organizations ?? []
  ).map((org: { id: string; name: string; slug: string }) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
  }));

  return Promise.all(
    orgs.map(async (org) => {
      try {
        const billing = await client.getOrgBilling(org.id);
        return {
          ...org,
          has_active_subscription: billing.has_active_subscription,
          customer_id: billing.customer_id,
        };
      } catch {
        return {
          ...org,
          has_active_subscription: false,
          customer_id: null,
        };
      }
    }),
  );
}

export function useOrganizations() {
  const selectedOrgId = useAuthStore((s) => s.selectedOrgId);

  const {
    data: orgsWithBilling,
    isLoading,
    error,
  } = useAuthenticatedQuery(
    organizationKeys.withBilling(),
    (client) => fetchOrgsWithBilling(client),
    { staleTime: 5 * 60 * 1000 },
  );

  const effectiveSelectedOrgId = useMemo(() => {
    if (selectedOrgId) return selectedOrgId;
    if (!orgsWithBilling?.length) return null;
    const withBilling = orgsWithBilling.find(
      (org) => org.has_active_subscription,
    );
    return (withBilling ?? orgsWithBilling[0]).id;
  }, [selectedOrgId, orgsWithBilling]);

  return {
    orgsWithBilling: orgsWithBilling ?? [],
    effectiveSelectedOrgId,
    isLoading,
    error,
  };
}
