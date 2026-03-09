import { trpcReact, trpcVanilla } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

interface TaskTimestamps {
  lastViewedAt: number | null;
  lastActivityAt: number | null;
}

const taskTimestampsQueryKey = [
  ["workspace", "getAllTaskTimestamps"],
  { type: "query" },
] as const;

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
  const queryClient = useQueryClient();

  const { data: rawTimestamps = {}, isLoading } =
    trpcReact.workspace.getAllTaskTimestamps.useQuery(undefined, {
      staleTime: 30_000,
    });

  const timestamps = useMemo(
    () => parseTimestamps(rawTimestamps),
    [rawTimestamps],
  );

  const markViewedMutation = trpcReact.workspace.markViewed.useMutation({
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskTimestampsQueryKey });
      const previous = queryClient.getQueryData<typeof rawTimestamps>(
        taskTimestampsQueryKey,
      );
      const now = new Date().toISOString();
      queryClient.setQueryData<typeof rawTimestamps>(
        taskTimestampsQueryKey,
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
        queryClient.setQueryData(taskTimestampsQueryKey, context.previous);
      }
    },
  });

  const markActivityMutation = trpcReact.workspace.markActivity.useMutation({
    onMutate: async ({ taskId }) => {
      await queryClient.cancelQueries({ queryKey: taskTimestampsQueryKey });
      const previous = queryClient.getQueryData<typeof rawTimestamps>(
        taskTimestampsQueryKey,
      );
      const existing = previous?.[taskId];
      const lastViewedAt = existing?.lastViewedAt
        ? new Date(existing.lastViewedAt).getTime()
        : 0;
      const now = Date.now();
      const activityTime = Math.max(now, lastViewedAt + 1);
      const activityIso = new Date(activityTime).toISOString();
      queryClient.setQueryData<typeof rawTimestamps>(
        taskTimestampsQueryKey,
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
        queryClient.setQueryData(taskTimestampsQueryKey, context.previous);
      }
    },
  });

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
    const raw = await trpcVanilla.workspace.getAllTaskTimestamps.query();
    return parseTimestamps(raw);
  },

  markAsViewed(taskId: string): void {
    trpcVanilla.workspace.markViewed.mutate({ taskId });
  },

  markActivity(taskId: string): void {
    trpcVanilla.workspace.markActivity.mutate({ taskId });
  },
};
