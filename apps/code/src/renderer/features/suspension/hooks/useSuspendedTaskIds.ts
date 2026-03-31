import { useTRPC } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export function useSuspendedTaskIds(): Set<string> {
  const trpcReact = useTRPC();
  const { data } = useQuery(
    trpcReact.suspension.suspendedTaskIds.queryOptions(),
  );
  return useMemo(() => new Set(data ?? []), [data]);
}
