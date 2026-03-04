import { useAuthStore } from "@features/auth/stores/authStore";
import type { Integration } from "@features/integrations/stores/integrationStore";
import type { ProjectInfo } from "@features/projects/hooks/useProjects";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export interface ProjectWithIntegrations {
  id: number;
  name: string;
  organization: { id: string; name: string };
  integrations: Integration[];
  hasGithubIntegration: boolean;
}

export function useAllOrgProjects() {
  const availableProjectIds = useAuthStore((s) => s.availableProjectIds);
  const selectedOrgId = useAuthStore((s) => s.selectedOrgId);
  const client = useAuthStore((s) => s.client);

  const { data: currentUser, isLoading: isUserLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => client?.getCurrentUser(),
    enabled: !!client,
    staleTime: 5 * 60 * 1000,
  });

  const orgNameMap = useMemo(() => {
    const map = new Map<string, string>();
    const orgs = currentUser?.organizations as
      | Array<{ id: string; name: string }>
      | undefined;
    if (orgs) {
      for (const org of orgs) {
        map.set(org.id, org.name);
      }
    }
    if (currentUser?.organization?.id) {
      const org = currentUser.organization as { id: string; name?: string };
      map.set(org.id, org.name ?? "Unknown Organization");
    }
    return map;
  }, [currentUser]);

  const projectQueries = useQueries({
    queries: availableProjectIds.map((id) => ({
      queryKey: ["project", id],
      queryFn: async () => {
        if (!client) throw new Error("Not authenticated");
        return client.getProject(id);
      },
      enabled: !!client,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const isProjectsLoading = projectQueries.some((q) => q.isLoading);

  const projects: ProjectInfo[] = useMemo(() => {
    const all = projectQueries
      .map((q) => q.data)
      .filter((p): p is NonNullable<typeof p> => p != null)
      .map((p) => {
        const orgId = typeof p.organization === "string" ? p.organization : "";
        return {
          id: p.id,
          name: p.name ?? `Project ${p.id}`,
          organization: {
            id: orgId,
            name: orgNameMap.get(orgId) ?? "Unknown Organization",
          },
        };
      });

    if (selectedOrgId) {
      return all.filter((p) => p.organization.id === selectedOrgId);
    }
    return all;
  }, [projectQueries, orgNameMap, selectedOrgId]);

  const integrationQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["integrations", project.id],
      queryFn: async () => {
        if (!client) throw new Error("Not authenticated");
        return client.getIntegrationsForProject(project.id);
      },
      enabled: !!client && projects.length > 0,
      staleTime: 60 * 1000,
    })),
  });

  const isLoading =
    isUserLoading ||
    isProjectsLoading ||
    integrationQueries.some((q) => q.isLoading);
  const isFetching = integrationQueries.some((q) => q.isFetching);

  const projectsWithIntegrations: ProjectWithIntegrations[] = useMemo(() => {
    return projects
      .map((project, index) => {
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
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projects, integrationQueries]);

  const projectsWithGithub = useMemo(
    () => projectsWithIntegrations.filter((p) => p.hasGithubIntegration),
    [projectsWithIntegrations],
  );

  return {
    projects: projectsWithIntegrations,
    projectsWithGithub,
    isLoading,
    isFetching,
  };
}
