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
  const {
    data: currentUser,
    isLoading: isQueryLoading,
    error,
  } = useCurrentUser({ client });
  const isInitialLoading = isQueryLoading && !currentUser;

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

  const { mutate: selectProject, isPending: isSelectingProject } =
    useSelectProjectMutation();
  const currentProject = projects.find((p) => p.id === currentProjectId);
  const groupedProjects = groupProjectsByOrg(projects);

  const userTeamId =
    currentUser?.team && typeof currentUser.team === "object"
      ? (currentUser.team as { id: number }).id
      : null;

  useEffect(() => {
    if (isSelectingProject) return;
    if (projects.length > 0 && !currentProject) {
      const preferredProject =
        (userTeamId && projects.find((p) => p.id === userTeamId)) ||
        projects[0];
      log.info("Auto-selecting project", {
        projectId: preferredProject.id,
        source:
          preferredProject.id === userTeamId ? "user-team" : "first-available",
        reason:
          currentProjectId == null
            ? "no project selected"
            : "current project not found in list",
      });
      selectProject(preferredProject.id);
    }
  }, [
    currentProject,
    currentProjectId,
    projects,
    selectProject,
    isSelectingProject,
    userTeamId,
  ]);

  return {
    projects,
    groupedProjects,
    currentProject,
    currentProjectId,
    currentUser: currentUser ?? null,
    isLoading: isInitialLoading,
    error,
  };
}
