import { useAuthStore } from "@features/auth/stores/authStore";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import type { ExternalDataSource } from "@renderer/api/posthogClient";

export function useExternalDataSources() {
  const projectId = useAuthStore((s) => s.projectId);
  return useAuthenticatedQuery<ExternalDataSource[]>(
    ["external-data-sources", projectId],
    (client) =>
      projectId
        ? client.listExternalDataSources(projectId)
        : Promise.resolve([]),
    { enabled: !!projectId, staleTime: 60_000 },
  );
}
