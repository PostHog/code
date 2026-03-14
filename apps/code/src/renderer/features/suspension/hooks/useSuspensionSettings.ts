import { trpcClient, useTRPC } from "@renderer/trpc";
import type { SuspensionSettings } from "@shared/types/suspension";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export function useSuspensionSettings() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();

  const { data: settings } = useQuery(
    trpcReact.suspension.settings.queryOptions(),
  );

  const updateSettings = async (update: Partial<SuspensionSettings>) => {
    await trpcClient.suspension.updateSettings.mutate(update);
    queryClient.invalidateQueries(trpcReact.suspension.settings.queryFilter());
  };

  return {
    settings: settings ?? {
      autoSuspendEnabled: true,
      maxActiveWorktrees: 5,
      autoSuspendAfterDays: 7,
    },
    updateSettings,
  };
}
