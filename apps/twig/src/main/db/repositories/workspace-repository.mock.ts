import type {
  ArchiveWorkspaceData,
  CreateActiveWorkspaceData,
  IWorkspaceRepository,
  Workspace,
} from "./workspace-repository";

export interface MockWorkspaceRepositoryOptions {
  failOnArchive?: boolean;
  failOnUnarchive?: boolean;
}

export interface MockWorkspaceRepository extends IWorkspaceRepository {
  _workspaces: Map<string, Workspace>;
}

export function createMockWorkspaceRepository(
  opts?: MockWorkspaceRepositoryOptions,
): MockWorkspaceRepository {
  const workspaces = new Map<string, Workspace>();
  const taskIndex = new Map<string, string>();

  const clone = (w: Workspace | null): Workspace | null =>
    w ? { ...w } : null;

  return {
    _workspaces: workspaces,
    findById: (id: string) => clone(workspaces.get(id) ?? null),
    findByTaskId: (taskId: string) => {
      const id = taskIndex.get(taskId);
      return clone(id ? (workspaces.get(id) ?? null) : null);
    },
    findActiveByTaskId: (taskId: string) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId && w.state === "active") return clone(w);
      }
      return null;
    },
    findArchivedByTaskId: (taskId: string) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId && w.state === "archived") return clone(w);
      }
      return null;
    },
    findAllActive: () =>
      Array.from(workspaces.values())
        .filter((w) => w.state === "active")
        .map((w) => ({ ...w })),
    findAllArchived: () =>
      Array.from(workspaces.values())
        .filter((w) => w.state === "archived")
        .map((w) => ({ ...w })),
    findAllActiveByRepositoryId: (repositoryId: string) =>
      Array.from(workspaces.values())
        .filter((w) => w.repositoryId === repositoryId && w.state === "active")
        .map((w) => ({ ...w })),
    findAllPinned: () =>
      Array.from(workspaces.values())
        .filter((w) => w.pinnedAt !== null)
        .map((w) => ({ ...w })),
    findAll: () => Array.from(workspaces.values()).map((w) => ({ ...w })),
    createActive: (data: CreateActiveWorkspaceData) => {
      const now = new Date().toISOString();
      const workspace: Workspace = {
        id: crypto.randomUUID(),
        taskId: data.taskId,
        repositoryId: data.repositoryId,
        mode: data.mode,
        state: "active",
        worktreeName: null,
        branchName: null,
        checkpointId: null,
        archivedAt: null,
        pinnedAt: null,
        lastViewedAt: null,
        lastActivityAt: null,
        createdAt: now,
        updatedAt: now,
      };
      workspaces.set(workspace.id, workspace);
      taskIndex.set(workspace.taskId, workspace.id);
      return { ...workspace };
    },
    archive: (taskId: string, data: ArchiveWorkspaceData) => {
      if (opts?.failOnArchive) {
        throw new Error("Injected failure on archive");
      }
      const id = taskIndex.get(taskId);
      const workspace = id ? workspaces.get(id) : undefined;
      if (!workspace || workspace.state !== "active") return null;
      workspace.state = "archived";
      workspace.archivedAt = new Date().toISOString();
      workspace.worktreeName = data.worktreeName;
      workspace.branchName = data.branchName;
      workspace.checkpointId = data.checkpointId;
      return { ...workspace };
    },
    unarchive: (taskId: string) => {
      if (opts?.failOnUnarchive) {
        throw new Error("Injected failure on unarchive");
      }
      const id = taskIndex.get(taskId);
      const workspace = id ? workspaces.get(id) : undefined;
      if (!workspace || workspace.state !== "archived") return null;
      workspace.state = "active";
      workspace.archivedAt = null;
      workspace.worktreeName = null;
      workspace.branchName = null;
      workspace.checkpointId = null;
      return { ...workspace };
    },
    deleteByTaskId: (taskId: string) => {
      const id = taskIndex.get(taskId);
      if (id) {
        workspaces.delete(id);
        taskIndex.delete(taskId);
      }
    },
    deleteById: (id: string) => {
      const workspace = workspaces.get(id);
      if (workspace) {
        taskIndex.delete(workspace.taskId);
        workspaces.delete(id);
      }
    },
    updatePinnedAt: () => {},
    updateLastViewedAt: () => {},
    updateLastActivityAt: () => {},
    updateMode: () => {},
    updateBranchName: () => {},
    deleteAll: () => {
      workspaces.clear();
      taskIndex.clear();
    },
  };
}
