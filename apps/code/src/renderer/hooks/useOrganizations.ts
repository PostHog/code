import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useCurrentUser } from "@features/auth/hooks/authQueries";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
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
  const selectedOrgId = useOnboardingStore((state) => state.selectedOrgId);
  const client = useOptionalAuthenticatedClient();
  const { data: currentUser } = useCurrentUser({ client });

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

    // Default to the user's currently active org in PostHog
    const userCurrentOrgId = currentUser?.organization?.id;
    if (
      userCurrentOrgId &&
      orgsWithBilling.some((org) => org.id === userCurrentOrgId)
    ) {
      return userCurrentOrgId;
    }

    const withBilling = orgsWithBilling.find(
      (org) => org.has_active_subscription,
    );
    return (withBilling ?? orgsWithBilling[0]).id;
  }, [currentUser?.organization?.id, orgsWithBilling, selectedOrgId]);

  const sortedOrgs = useMemo(() => {
    return [...(orgsWithBilling ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [orgsWithBilling]);

  return {
    orgsWithBilling: sortedOrgs,
    effectiveSelectedOrgId,
    isLoading,
    error,
  };
}
