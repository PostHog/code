import { trpcClient, useTRPC } from "@renderer/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

interface TaskTimestamps {
  lastViewedAt: number | null;
  lastActivityAt: number | null;
}

function parseTimestamps(
  raw: Record<
    string,
    {
      pinnedAt: string | null;
      lastViewedAt: string | null;
      lastActivityAt: string | null;
    }
  >,
): Record<string, TaskTimestamps> {
  const result: Record<string, TaskTimestamps> = {};
  for (const [taskId, ts] of Object.entries(raw)) {
    result[taskId] = {
      lastViewedAt: ts.lastViewedAt
        ? new Date(ts.lastViewedAt).getTime()
        : null,
      lastActivityAt: ts.lastActivityAt
        ? new Date(ts.lastActivityAt).getTime()
        : null,
    };
  }
  return result;
}

export function useTaskViewed() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();
  const timestampsQueryKey =
    trpcReact.workspace.getAllTaskTimestamps.queryKey();

  const { data: rawTimestamps = {}, isLoading } = useQuery(
    trpcReact.workspace.getAllTaskTimestamps.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );

  const timestamps = useMemo(
    () => parseTimestamps(rawTimestamps),
    [rawTimestamps],
  );

  const markViewedMutation = useMutation(
    trpcReact.workspace.markViewed.mutationOptions({
      onMutate: async ({ taskId }) => {
        await queryClient.cancelQueries({ queryKey: timestampsQueryKey });
        const previous =
          queryClient.getQueryData<typeof rawTimestamps>(timestampsQueryKey);
        const now = new Date().toISOString();
        queryClient.setQueryData<typeof rawTimestamps>(
          timestampsQueryKey,
          (old) => {
            if (!old)
              return {
                [taskId]: {
                  pinnedAt: null,
                  lastViewedAt: now,
                  lastActivityAt: null,
                },
              };
            return {
              ...old,
              [taskId]: { ...old[taskId], lastViewedAt: now },
            };
          },
        );
        return { previous };
      },
      onError: (_, __, context) => {
        if (context?.previous) {
          queryClient.setQueryData(timestampsQueryKey, context.previous);
        }
      },
    }),
  );

  const markActivityMutation = useMutation(
    trpcReact.workspace.markActivity.mutationOptions({
      onMutate: async ({ taskId }) => {
        await queryClient.cancelQueries({ queryKey: timestampsQueryKey });
        const previous =
          queryClient.getQueryData<typeof rawTimestamps>(timestampsQueryKey);
        const existing = previous?.[taskId];
        const lastViewedAt = existing?.lastViewedAt
          ? new Date(existing.lastViewedAt).getTime()
          : 0;
        const now = Date.now();
        const activityTime = Math.max(now, lastViewedAt + 1);
        const activityIso = new Date(activityTime).toISOString();
        queryClient.setQueryData<typeof rawTimestamps>(
          timestampsQueryKey,
          (old) => {
            if (!old)
              return {
                [taskId]: {
                  pinnedAt: null,
                  lastViewedAt: null,
                  lastActivityAt: activityIso,
                },
              };
            return {
              ...old,
              [taskId]: { ...old[taskId], lastActivityAt: activityIso },
            };
          },
        );
        return { previous };
      },
      onError: (_, __, context) => {
        if (context?.previous) {
          queryClient.setQueryData(timestampsQueryKey, context.previous);
        }
      },
    }),
  );

  const markViewedMutationRef = useRef(markViewedMutation);
  markViewedMutationRef.current = markViewedMutation;

  const markActivityMutationRef = useRef(markActivityMutation);
  markActivityMutationRef.current = markActivityMutation;

  const markAsViewed = useCallback((taskId: string) => {
    markViewedMutationRef.current.mutate({ taskId });
  }, []);

  const markActivity = useCallback((taskId: string) => {
    markActivityMutationRef.current.mutate({ taskId });
  }, []);

  const getLastViewedAt = useCallback(
    (taskId: string) => timestamps[taskId]?.lastViewedAt ?? undefined,
    [timestamps],
  );

  const getLastActivityAt = useCallback(
    (taskId: string) => timestamps[taskId]?.lastActivityAt ?? undefined,
    [timestamps],
  );

  return {
    timestamps,
    isLoading,
    markAsViewed,
    markActivity,
    getLastViewedAt,
    getLastActivityAt,
  };
}

export const taskViewedApi = {
  async loadTimestamps(): Promise<Record<string, TaskTimestamps>> {
    const raw = await trpcClient.workspace.getAllTaskTimestamps.query();
    return parseTimestamps(raw);
  },

  markAsViewed(taskId: string): void {
    trpcClient.workspace.markViewed.mutate({ taskId });
  },

  markActivity(taskId: string): void {
    trpcClient.workspace.markActivity.mutate({ taskId });
  },
};
