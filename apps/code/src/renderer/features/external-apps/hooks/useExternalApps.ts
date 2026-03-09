import { trpcReact, trpcVanilla } from "@renderer/trpc";
import type { DetectedApplication } from "@shared/types";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

export function useExternalApps() {
  const queryClient = useQueryClient();

  const { data: detectedApps = [], isLoading: appsLoading } =
    trpcReact.externalApps.getDetectedApps.useQuery(undefined, {
      staleTime: 60_000,
    });

  const { data: lastUsedData, isLoading: lastUsedLoading } =
    trpcReact.externalApps.getLastUsed.useQuery(undefined, {
      staleTime: 60_000,
    });

  const setLastUsedMutation = trpcReact.externalApps.setLastUsed.useMutation({
    onSuccess: (_, { appId }) => {
      queryClient.setQueryData(
        [["externalApps", "getLastUsed"], { type: "query" }],
        { lastUsedApp: appId },
      );
    },
  });

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
    return trpcVanilla.externalApps.getDetectedApps.query();
  },
  async getLastUsed(): Promise<string | undefined> {
    const result = await trpcVanilla.externalApps.getLastUsed.query();
    return result.lastUsedApp;
  },
  async setLastUsed(appId: string): Promise<void> {
    await trpcVanilla.externalApps.setLastUsed.mutate({ appId });
  },
};
