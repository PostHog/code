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
  const selectProject = useAuthStore((s) => s.selectProject);

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
  }, [projects, currentProject, currentProjectId, selectProject]);

  return {
    projects,
    groupedProjects,
    currentProject,
    currentProjectId,
  };
}
