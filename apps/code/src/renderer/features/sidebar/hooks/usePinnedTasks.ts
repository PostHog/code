import { trpcClient, useTRPC } from "@renderer/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef } from "react";

export function usePinnedTasks() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();
  const pinnedQueryKey = trpcReact.workspace.getPinnedTaskIds.queryKey();

  const { data: pinnedTaskIds = [], isLoading } = useQuery(
    trpcReact.workspace.getPinnedTaskIds.queryOptions(undefined, {
      staleTime: 30_000,
    }),
  );

  const pinnedSet = useMemo(() => new Set(pinnedTaskIds), [pinnedTaskIds]);

  const togglePinMutation = useMutation(
    trpcReact.workspace.togglePin.mutationOptions({
      onMutate: async ({ taskId }) => {
        await queryClient.cancelQueries({ queryKey: pinnedQueryKey });
        const previous = queryClient.getQueryData<string[]>(pinnedQueryKey);
        const wasPinned = previous?.includes(taskId);
        queryClient.setQueryData<string[]>(pinnedQueryKey, (old) => {
          if (!old) return wasPinned ? [] : [taskId];
          return wasPinned
            ? old.filter((id) => id !== taskId)
            : [...old, taskId];
        });
        return { previous, wasPinned, taskId };
      },
      onError: (_, __, context) => {
        if (context?.previous) {
          queryClient.setQueryData(pinnedQueryKey, context.previous);
        }
      },
      onSuccess: (result, _, context) => {
        const taskId = context?.taskId;
        if (!taskId) return;
        queryClient.setQueryData<string[]>(pinnedQueryKey, (old) => {
          if (!old) return result.isPinned ? [taskId] : [];
          const filtered = old.filter((id) => id !== taskId);
          return result.isPinned ? [...filtered, taskId] : filtered;
        });
      },
    }),
  );

  const togglePinMutationRef = useRef(togglePinMutation);
  togglePinMutationRef.current = togglePinMutation;

  const pinnedSetRef = useRef(pinnedSet);
  pinnedSetRef.current = pinnedSet;

  const togglePin = useCallback(async (taskId: string) => {
    await togglePinMutationRef.current.mutateAsync({ taskId });
  }, []);

  const unpin = useCallback(async (taskId: string) => {
    if (!pinnedSetRef.current.has(taskId)) return;
    const result = await togglePinMutationRef.current.mutateAsync({ taskId });
    if (result.isPinned) {
      await togglePinMutationRef.current.mutateAsync({ taskId });
    }
  }, []);

  const isPinned = useCallback(
    (taskId: string) => pinnedSet.has(taskId),
    [pinnedSet],
  );

  return {
    pinnedTaskIds: pinnedSet,
    isLoading,
    togglePin,
    unpin,
    isPinned,
  };
}

export const pinnedTasksApi = {
  async getPinnedTaskIds(): Promise<string[]> {
    return trpcClient.workspace.getPinnedTaskIds.query();
  },
  async togglePin(
    taskId: string,
  ): Promise<{ taskId: string; isPinned: boolean }> {
    const result = await trpcClient.workspace.togglePin.mutate({ taskId });
    return { taskId, isPinned: result.isPinned };
  },
  async unpin(taskId: string): Promise<void> {
    const result = await trpcClient.workspace.togglePin.mutate({ taskId });
    if (result.isPinned) {
      await trpcClient.workspace.togglePin.mutate({ taskId });
    }
  },
  isPinned(pinnedTaskIds: Set<string>, taskId: string): boolean {
    return pinnedTaskIds.has(taskId);
  },
};
