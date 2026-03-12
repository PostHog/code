import { useTRPC } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export function useArchivedTaskIds(): Set<string> {
  const trpcReact = useTRPC();
  const { data } = useQuery(trpcReact.archive.archivedTaskIds.queryOptions());
  return useMemo(() => new Set(data ?? []), [data]);
}
