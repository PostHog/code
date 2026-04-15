import type { Task } from "@shared/types";
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: true,
    },
  },
});

export function getCachedTask(taskId: string): Task | undefined {
  return queryClient
    .getQueriesData<Task[]>({ queryKey: ["tasks", "list"] })
    .flatMap(([, tasks]) => tasks ?? [])
    .find((t) => t.id === taskId);
}
