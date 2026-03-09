import { trpcReact } from "@renderer/trpc";
import { useMemo } from "react";

export function useArchivedTaskIds(): Set<string> {
  const { data } = trpcReact.archive.archivedTaskIds.useQuery();
  return useMemo(() => new Set(data ?? []), [data]);
}
