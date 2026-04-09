import { useAuthenticatedClient } from "@features/auth/hooks/authClient";
import { AUTH_SCOPED_QUERY_META } from "@features/auth/hooks/authQueries";
import {
  type Integration,
  useIntegrationSelectors,
  useIntegrationStore,
} from "@features/integrations/stores/integrationStore";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useAuthenticatedQuery } from "./useAuthenticatedQuery";

const integrationKeys = {
  all: ["integrations"] as const,
  list: () => [...integrationKeys.all, "list"] as const,
  repositories: (integrationId?: number) =>
    [...integrationKeys.all, "repositories", integrationId] as const,
  branches: (integrationId?: number, repo?: string | null) =>
    [...integrationKeys.all, "branches", integrationId, repo] as const,
};

export function useIntegrations() {
  const setIntegrations = useIntegrationStore((state) => state.setIntegrations);

  const query = useAuthenticatedQuery(
    integrationKeys.list(),
    (client) => client.getIntegrations() as Promise<Integration[]>,
  );

  useEffect(() => {
    if (query.data) {
      setIntegrations(query.data);
    }
  }, [query.data, setIntegrations]);

  return query;
}

function useAllGithubRepositories(githubIntegrations: Integration[]) {
  const client = useAuthenticatedClient();

  return useQueries({
    queries: githubIntegrations.map((integration) => ({
      queryKey: integrationKeys.repositories(integration.id),
      queryFn: async () => {
        if (!client) throw new Error("Not authenticated");
        const repos = await client.getGithubRepositories(integration.id);
        return { integrationId: integration.id, repos };
      },
      enabled: !!client,
      staleTime: 5 * 60 * 1000,
      meta: AUTH_SCOPED_QUERY_META,
    })),
    combine: (results) => {
      const map: Record<string, number> = {};
      let pending = false;
      for (const result of results) {
        if (result.isPending) pending = true;
        if (!result.data) continue;
        for (const repo of result.data.repos) {
          if (!(repo in map)) {
            map[repo] = result.data.integrationId;
          }
        }
      }
      return { repositoryMap: map, isPending: pending };
    },
  });
}

export function useGithubBranches(
  integrationId?: number,
  repo?: string | null,
) {
  return useAuthenticatedQuery(
    integrationKeys.branches(integrationId, repo),
    async (client) => {
      if (!integrationId || !repo) return { branches: [], defaultBranch: null };
      return await client.getGithubBranches(integrationId, repo);
    },
    { staleTime: 0, refetchOnMount: "always" },
  );
}

export function useRepositoryIntegration() {
  const { isPending: integrationsPending } = useIntegrations();
  const { githubIntegrations, hasGithubIntegration } =
    useIntegrationSelectors();

  const { repositoryMap, isPending: reposPending } =
    useAllGithubRepositories(githubIntegrations);

  const repositories = useMemo(
    () => Object.keys(repositoryMap),
    [repositoryMap],
  );

  const getIntegrationIdForRepo = useCallback(
    (repoKey: string) => repositoryMap[repoKey?.toLowerCase()],
    [repositoryMap],
  );

  const isRepoInIntegration = useCallback(
    (repoKey: string) => !repoKey || repoKey.toLowerCase() in repositoryMap,
    [repositoryMap],
  );

  return {
    repositories,
    getIntegrationIdForRepo,
    isRepoInIntegration,
    isLoadingRepos: integrationsPending || reposPending,
    hasGithubIntegration,
  };
}
