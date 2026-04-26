import { trpc } from "@renderer/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useMemo } from "react";
import { isDraftFromManifest } from "../utils/isDraftTask";

/**
 * Returns the set of taskIds that are currently drafts (have a scratchpad
 * manifest with `published: false`).
 *
 * Implementation: a single `scratchpad.list` query. Subscriptions to scratchpad
 * lifecycle events invalidate the cache so the set stays fresh.
 */
export function useDraftTaskIds(): Set<string> {
  const queryClient = useQueryClient();

  const { data } = useQuery(
    trpc.scratchpad.list.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );

  const invalidate = () => {
    void queryClient.invalidateQueries(trpc.scratchpad.list.pathFilter());
  };

  useSubscription(
    trpc.scratchpad.onCreated.subscriptionOptions(undefined, {
      onData: invalidate,
    }),
  );
  useSubscription(
    trpc.scratchpad.onManifestUpdated.subscriptionOptions(undefined, {
      onData: invalidate,
    }),
  );
  useSubscription(
    trpc.scratchpad.onDeleted.subscriptionOptions(undefined, {
      onData: invalidate,
    }),
  );

  return useMemo(() => {
    const set = new Set<string>();
    if (!data) return set;
    for (const entry of data) {
      if (isDraftFromManifest(entry.manifest)) {
        set.add(entry.taskId);
      }
    }
    return set;
  }, [data]);
}
