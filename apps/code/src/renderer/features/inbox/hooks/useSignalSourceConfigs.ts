import { useAuthStore } from "@features/auth/stores/authStore";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { SignalSourceConfig } from "@renderer/api/posthogClient";

export function useSignalSourceConfigs() {
  const projectId = useAuthStore((s) => s.projectId);
  return useAuthenticatedQuery<SignalSourceConfig[]>(
    ["signals", "source-configs", projectId],
    (client) =>
      projectId
        ? client.listSignalSourceConfigs(projectId)
        : Promise.resolve([]),
    { enabled: !!projectId, staleTime: 30_000 },
  );
}
