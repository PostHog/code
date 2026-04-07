import { useTRPC } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";

export function usePrDetails(prUrl: string | null) {
  const trpc = useTRPC();

  const metaQuery = useQuery(
    trpc.git.getPrDetailsByUrl.queryOptions(
      { prUrl: prUrl as string },
      {
        enabled: !!prUrl,
        staleTime: 60_000,
        retry: 1,
      },
    ),
  );

  return {
    meta: {
      state: metaQuery.data?.state ?? null,
      merged: metaQuery.data?.merged ?? false,
      draft: metaQuery.data?.draft ?? false,
      isLoading: metaQuery.isLoading,
    },
  };
}
