import { useAuthStore } from "@features/auth/stores/authStore";
import type { PostHogAPIClient } from "@renderer/api/posthogClient";
import type { QueryKey } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";

type AuthenticatedInfiniteQueryFn<TData, TPageParam> = (
  client: PostHogAPIClient,
  pageParam: TPageParam,
) => Promise<TData>;

interface UseAuthenticatedInfiniteQueryOptions<TData, TPageParam> {
  enabled?: boolean;
  getNextPageParam: (
    lastPage: TData,
    allPages: TData[],
  ) => TPageParam | undefined;
  initialPageParam: TPageParam;
}

export function useAuthenticatedInfiniteQuery<
  TData,
  TPageParam,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: AuthenticatedInfiniteQueryFn<TData, TPageParam>,
  options: UseAuthenticatedInfiniteQueryOptions<TData, TPageParam>,
) {
  const client = useAuthStore((state) => state.client);

  return useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      if (!client) throw new Error("Not authenticated");
      return await queryFn(client, pageParam as TPageParam);
    },
    enabled: !!client && (options.enabled ?? true),
    getNextPageParam: options.getNextPageParam,
    initialPageParam: options.initialPageParam,
  });
}
