import { trpcClient, useTRPC } from "@renderer/trpc";
import type { DetectedApplication } from "@shared/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export function useExternalApps() {
  const trpcReact = useTRPC();
  const queryClient = useQueryClient();

  const { data: detectedApps = [], isLoading: appsLoading } = useQuery(
    trpcReact.externalApps.getDetectedApps.queryOptions(undefined, {
      staleTime: 60_000,
    }),
  );

  const { data: lastUsedData, isLoading: lastUsedLoading } = useQuery(
    trpcReact.externalApps.getLastUsed.queryOptions(undefined, {
      staleTime: 60_000,
    }),
  );

  const setLastUsedMutation = useMutation(
    trpcReact.externalApps.setLastUsed.mutationOptions({
      onSuccess: (_, { appId }) => {
        queryClient.setQueryData(
          trpcReact.externalApps.getLastUsed.queryKey(),
          { lastUsedApp: appId },
        );
      },
    }),
  );

  const lastUsedAppId = lastUsedData?.lastUsedApp;
  const isLoading = appsLoading || lastUsedLoading;

  const defaultApp = useMemo(() => {
    if (lastUsedAppId) {
      const app = detectedApps.find((a) => a.id === lastUsedAppId);
      if (app) return app;
    }
    return detectedApps[0] || null;
  }, [detectedApps, lastUsedAppId]);

  const setLastUsedApp = useCallback(
    async (appId: string) => {
      await setLastUsedMutation.mutateAsync({ appId });
    },
    [setLastUsedMutation],
  );

  return {
    detectedApps,
    lastUsedAppId,
    defaultApp,
    isLoading,
    setLastUsedApp,
  };
}

export const externalAppsApi = {
  async getDetectedApps(): Promise<DetectedApplication[]> {
    return trpcClient.externalApps.getDetectedApps.query();
  },
  async getLastUsed(): Promise<string | undefined> {
    const result = await trpcClient.externalApps.getLastUsed.query();
    return result.lastUsedApp;
  },
  async setLastUsed(appId: string): Promise<void> {
    await trpcClient.externalApps.setLastUsed.mutate({ appId });
  },
};
