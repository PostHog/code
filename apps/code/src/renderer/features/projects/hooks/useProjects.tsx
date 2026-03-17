import {
  type OrgProjects,
  useAuthStore,
} from "@features/auth/stores/authStore";
import { logger } from "@utils/logger";
import { useEffect, useMemo } from "react";

const log = logger.scope("useProjects");

export interface ProjectInfo {
  id: number;
  name: string;
  organization: { id: string; name: string };
}

export interface GroupedProjects {
  orgId: string;
  orgName: string;
  projects: ProjectInfo[];
}

export function groupProjectsByOrg(
  orgProjectsMap: Record<string, OrgProjects>,
): GroupedProjects[] {
  return Object.entries(orgProjectsMap).map(([orgId, org]) => ({
    orgId,
    orgName: org.orgName,
    projects: org.projects.map((p) => ({
      id: p.id,
      name: p.name,
      organization: { id: orgId, name: org.orgName },
    })),
  }));
}

export function useProjects() {
  const orgProjectsMap = useAuthStore((s) => s.orgProjectsMap);
  const currentProjectId = useAuthStore((s) => s.projectId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const selectProject = useAuthStore((s) => s.selectProject);
  const logout = useAuthStore((s) => s.logout);

  const groupedProjects = useMemo(
    () => groupProjectsByOrg(orgProjectsMap),
    [orgProjectsMap],
  );

  const projects = useMemo(
    () => groupedProjects.flatMap((g) => g.projects),
    [groupedProjects],
  );

  const currentProject = projects.find((p) => p.id === currentProjectId);

  useEffect(() => {
    const hasOrgData = Object.keys(orgProjectsMap).length > 0;
    if (isAuthenticated && hasOrgData && projects.length === 0) {
      log.info("No projects available, logging out");
      logout();
      return;
    }
    if (projects.length > 0 && !currentProject) {
      log.info("Auto-selecting first available project", {
        projectId: projects[0].id,
        reason:
          currentProjectId == null
            ? "no project selected"
            : "current project not found in list",
      });
      selectProject(projects[0].id);
    }
  }, [
    isAuthenticated,
    projects,
    currentProject,
    currentProjectId,
    selectProject,
    logout,
    orgProjectsMap,
  ]);

  return {
    projects,
    groupedProjects,
    currentProject,
    currentProjectId,
  };
}
