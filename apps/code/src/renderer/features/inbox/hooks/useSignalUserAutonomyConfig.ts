import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { SignalUserAutonomyConfig } from "@shared/types";

export function useSignalUserAutonomyConfig(options?: {
  enabled?: boolean;
  staleTime?: number;
}) {
  return useAuthenticatedQuery<SignalUserAutonomyConfig | null>(
    ["signals", "user-autonomy-config"],
    async (client) => {
      try {
        return await client.getSignalUserAutonomyConfig();
      } catch {
        // 404 when user has opted out (no config record)
        return null;
      }
    },
    {
      enabled: options?.enabled ?? true,
      staleTime: options?.staleTime ?? 30_000,
    },
  );
}
