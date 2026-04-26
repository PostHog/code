import { trpc } from "@renderer/trpc";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { isDraftFromManifest } from "../utils/isDraftTask";

/** Coalesce rapid lifecycle events (e.g. publish patches the manifest a few
 *  times in quick succession) into a single cache invalidation. */
const INVALIDATE_DEBOUNCE_MS = 150;

/**
 * Returns the set of taskIds that are currently drafts (have a scratchpad
 * manifest with `published: false`).
 *
 * Implementation: a single `scratchpad.list` query. Subscriptions to scratchpad
 * lifecycle events invalidate the cache (debounced) so the set stays fresh
 * without thrashing the sidebar on bursts of manifest updates.
 */
export function useDraftTaskIds(): Set<string> {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data } = useQuery(
    trpc.scratchpad.list.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );

  const invalidate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void queryClient.invalidateQueries(trpc.scratchpad.list.pathFilter());
    }, INVALIDATE_DEBOUNCE_MS);
  }, [queryClient]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

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
