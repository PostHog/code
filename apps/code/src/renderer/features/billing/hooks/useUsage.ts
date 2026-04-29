import { useTRPC } from "@renderer/trpc";
import { useRendererWindowFocusStore } from "@stores/rendererWindowFocusStore";
import { useQuery } from "@tanstack/react-query";

const USAGE_REFETCH_INTERVAL_MS = 30_000;

export function useUsage({ enabled = true }: { enabled?: boolean } = {}) {
  const trpc = useTRPC();
  const focused = useRendererWindowFocusStore((s) => s.focused);
  const {
    data: usage,
    isLoading,
    refetch,
  } = useQuery({
    ...trpc.llmGateway.usage.queryOptions(),
    enabled,
    refetchInterval: focused && enabled ? USAGE_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  });
  return { usage: usage ?? null, isLoading, refetch };
}
