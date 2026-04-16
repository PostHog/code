import { useAuthenticatedClient } from "@features/auth/hooks/authClient";
import { AUTH_SCOPED_QUERY_META } from "@features/auth/hooks/authQueries";
import {
  type Integration,
  useIntegrationSelectors,
  useIntegrationStore,
} from "@features/integrations/stores/integrationStore";
import { useQueries } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthenticatedInfiniteQuery } from "./useAuthenticatedInfiniteQuery";
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

// Keep the first page small so it returns in a single upstream GitHub round
// trip (GitHub's max per_page is 100), then fetch the remainder in larger
// chunks to keep the total number of client/PostHog round trips low.
const BRANCHES_FIRST_PAGE_SIZE = 100;
const BRANCHES_PAGE_SIZE = 1000;

interface GithubBranchesPage {
  branches: string[];
  defaultBranch: string | null;
  hasMore: boolean;
}

export function useGithubBranches(
  integrationId?: number,
  repo?: string | null,
) {
  // While paused we stop chaining `fetchNextPage` calls. The flag is scoped
  // to the current query target and resets whenever it changes, so switching
  // repos or integrations starts a fresh fetch.
  const [paused, setPaused] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional reset on key change
  useEffect(() => {
    setPaused(false);
  }, [integrationId, repo]);

  const query = useAuthenticatedInfiniteQuery<GithubBranchesPage, number>(
    integrationKeys.branches(integrationId, repo),
    async (client, offset) => {
      if (!integrationId || !repo) {
        return { branches: [], defaultBranch: null, hasMore: false };
      }
      const pageSize =
        offset === 0 ? BRANCHES_FIRST_PAGE_SIZE : BRANCHES_PAGE_SIZE;
      return await client.getGithubBranchesPage(
        integrationId,
        repo,
        offset,
        pageSize,
      );
    },
    {
      initialPageParam: 0,
      getNextPageParam: (lastPage, allPages) => {
        if (!lastPage.hasMore) return undefined;
        return allPages.reduce((n, p) => n + p.branches.length, 0);
      },
    },
  );

  // Auto-fetch remaining pages in the background whenever we are not paused.
  // Any in-flight page is allowed to finish and land in the cache; the pause
  // just prevents us from kicking off the next one. Resuming picks up from
  // wherever `getNextPageParam` computes the next offset to be.
  useEffect(() => {
    if (paused) return;
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [
    paused,
    query.hasNextPage,
    query.isFetchingNextPage,
    query.fetchNextPage,
  ]);

  const data = useMemo(() => {
    if (!query.data?.pages.length) {
      return { branches: [] as string[], defaultBranch: null };
    }
    return {
      branches: query.data.pages.flatMap((p) => p.branches),
      defaultBranch: query.data.pages[0]?.defaultBranch ?? null,
    };
  }, [query.data?.pages]);

  const pauseLoadingMore = useCallback(() => setPaused(true), []);
  const resumeLoadingMore = useCallback(() => setPaused(false), []);

  return {
    data,
    isPending: query.isPending,
    isFetchingMore:
      !paused && (query.isFetchingNextPage || (query.hasNextPage ?? false)),
    pauseLoadingMore,
    resumeLoadingMore,
  };
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
