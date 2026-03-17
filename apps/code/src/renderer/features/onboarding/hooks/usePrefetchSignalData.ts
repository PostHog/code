import { useAuthStore } from "@features/auth/stores/authStore";
import { useProjects } from "@features/projects/hooks/useProjects";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Prefetches onboarding step data so GitHub and Signals steps load instantly.
 * Call this early in the onboarding flow (e.g. in OnboardingFlow component).
 */
export function usePrefetchSignalData(): void {
  const client = useAuthStore((s) => s.client);
  const projectId = useAuthStore((s) => s.projectId);
  const { projects } = useProjects();
  const queryClient = useQueryClient();

  // Prefetch per-project integrations (used by GitIntegrationStep)
  useEffect(() => {
    if (!client || projects.length === 0) return;

    for (const project of projects) {
      queryClient.prefetchQuery({
        queryKey: ["integrations", project.id],
        queryFn: () => client.getIntegrationsForProject(project.id),
        staleTime: 60_000,
      });
    }
  }, [client, projects, queryClient]);

  // Prefetch signals data and repo list
  useEffect(() => {
    if (!client || !projectId) return;

    queryClient.prefetchQuery({
      queryKey: ["signals", "source-configs", projectId],
      queryFn: () => client.listSignalSourceConfigs(projectId),
      staleTime: 30_000,
    });

    queryClient.prefetchQuery({
      queryKey: ["external-data-sources", projectId],
      queryFn: () => client.listExternalDataSources(projectId),
      staleTime: 60_000,
    });

    // Prefetch integrations list, then prefetch GitHub repos if integration exists
    queryClient.prefetchQuery({
      queryKey: ["integrations", "list"],
      queryFn: async () => {
        const integrations = await client.getIntegrations();
        const ghIntegration = (
          integrations as { id: number; kind: string }[]
        ).find((i) => i.kind === "github");
        if (ghIntegration) {
          queryClient.prefetchQuery({
            queryKey: ["integrations", "repositories", ghIntegration.id],
            queryFn: () => client.getGithubRepositories(ghIntegration.id),
            staleTime: 60_000,
          });
        }
        return integrations;
      },
      staleTime: 60_000,
    });
  }, [client, projectId, queryClient]);
}
