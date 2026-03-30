import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useSelectProjectMutation } from "@features/auth/hooks/authMutations";
import {
  useAuthStateValue,
  useCurrentUser,
} from "@features/auth/hooks/authQueries";
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

export function groupProjectsByOrg(projects: ProjectInfo[]): GroupedProjects[] {
  const orgMap = new Map<string, GroupedProjects>();

  for (const project of projects) {
    const orgId = project.organization.id;
    if (!orgMap.has(orgId)) {
      orgMap.set(orgId, {
        orgId,
        orgName: project.organization.name,
        projects: [],
      });
    }
    orgMap.get(orgId)?.projects.push(project);
  }

  return Array.from(orgMap.values());
}

export function useProjects() {
  const availableProjectIds = useAuthStateValue(
    (state) => state.availableProjectIds,
  );
  const currentProjectId = useAuthStateValue((state) => state.projectId);
  const client = useOptionalAuthenticatedClient();
  const { data: currentUser, isLoading, error } = useCurrentUser({ client });

  const projects = useMemo(() => {
    if (!currentUser?.organization) return [];

    const rawTeams = Array.isArray(currentUser.organization.teams)
      ? currentUser.organization.teams
      : [];
    const teams = rawTeams
      .filter(
        (t): t is { id: number | string; name?: string } =>
          t != null &&
          typeof t === "object" &&
          (typeof t.id === "number" || typeof t.id === "string"),
      )
      .map((t) => ({ ...t, id: Number(t.id) }))
      .filter((t) => !Number.isNaN(t.id));
    const orgName = currentUser.organization.name ?? "Unknown Organization";
    const orgId = currentUser.organization.id ?? "";

    const teamMap = new Map(teams.map((t) => [t.id, t]));

    return availableProjectIds
      .map((id) => {
        const team = teamMap.get(id);
        if (!team) return null;
        return {
          id,
          name: team.name ?? `Project ${id}`,
          organization: { id: orgId, name: orgName },
        };
      })
      .filter((p): p is ProjectInfo => p !== null);
  }, [currentUser, availableProjectIds]);

  const selectProjectMutation = useSelectProjectMutation();
  const currentProject = projects.find((p) => p.id === currentProjectId);
  const groupedProjects = groupProjectsByOrg(projects);

  useEffect(() => {
    if (projects.length > 0 && !currentProject) {
      log.info("Auto-selecting first available project", {
        projectId: projects[0].id,
        reason:
          currentProjectId == null
            ? "no project selected"
            : "current project not found in list",
      });
      selectProjectMutation.mutate(projects[0].id);
    }
  }, [currentProject, currentProjectId, projects, selectProjectMutation]);

  return {
    projects,
    groupedProjects,
    currentProject,
    currentProjectId,
    currentUser: currentUser ?? null,
    isLoading,
    error,
  };
}
