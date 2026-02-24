import { useAuthStore } from "@features/auth/stores/authStore";
import type { Integration } from "@features/integrations/stores/integrationStore";
import { useProjects } from "@features/projects/hooks/useProjects";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

export interface ProjectWithIntegrations {
  id: number;
  name: string;
  organization: { id: string; name: string };
  integrations: Integration[];
  hasGithubIntegration: boolean;
}

export function useProjectsWithIntegrations() {
  const { projects, isLoading: projectsLoading } = useProjects();
  const client = useAuthStore((s) => s.client);

  // Fetch integrations for each project in parallel
  const integrationQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["integrations", project.id],
      queryFn: async () => {
        if (!client) throw new Error("Not authenticated");
        return client.getIntegrationsForProject(project.id);
      },
      enabled: !!client && projects.length > 0,
      staleTime: 60 * 1000, // 1 minute
    })),
  });

  const isLoading =
    projectsLoading || integrationQueries.some((q) => q.isLoading);

  const projectsWithIntegrations: ProjectWithIntegrations[] = useMemo(() => {
    return projects.map((project, index) => {
      const integrations = (integrationQueries[index]?.data ??
        []) as Integration[];
      const hasGithubIntegration = integrations.some(
        (i) => i.kind === "github",
      );
      return {
        ...project,
        integrations,
        hasGithubIntegration,
      };
    });
  }, [projects, integrationQueries]);

  const projectsWithGithub = useMemo(
    () => projectsWithIntegrations.filter((p) => p.hasGithubIntegration),
    [projectsWithIntegrations],
  );

  return {
    projects: projectsWithIntegrations,
    projectsWithGithub,
    isLoading,
  };
}
