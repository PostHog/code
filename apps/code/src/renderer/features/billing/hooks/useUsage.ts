import { useTRPC } from "@renderer/trpc";
import { useRendererWindowFocusStore } from "@stores/rendererWindowFocusStore";
import { useQuery } from "@tanstack/react-query";

const USAGE_REFETCH_INTERVAL_MS = 60_000;

export function useUsage() {
  const trpc = useTRPC();
  const focused = useRendererWindowFocusStore((s) => s.focused);
  const { data: usage, isLoading } = useQuery({
    ...trpc.llmGateway.usage.queryOptions(),
    refetchInterval: focused ? USAGE_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  return { usage: usage ?? null, isLoading };
}
