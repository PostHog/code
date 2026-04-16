import type {
  CreateWorkspaceData,
  IWorkspaceRepository,
  Workspace,
} from "./workspace-repository";

export interface MockWorkspaceRepository extends IWorkspaceRepository {
  _workspaces: Map<string, Workspace>;
}

export function createMockWorkspaceRepository(): MockWorkspaceRepository {
  const workspaces = new Map<string, Workspace>();

  const clone = (w: Workspace | null): Workspace | null =>
    w ? { ...w } : null;

  return {
    _workspaces: workspaces,
    findById: (id: string) => clone(workspaces.get(id) ?? null),
    findByTaskId: (taskId: string) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId) return { ...w };
      }
      return null;
    },
    findAllByTaskId: (taskId: string) =>
      Array.from(workspaces.values())
        .filter((w) => w.taskId === taskId)
        .map((w) => ({ ...w })),
    findAllByRepositoryId: (repositoryId: string) =>
      Array.from(workspaces.values())
        .filter((w) => w.repositoryId === repositoryId)
        .map((w) => ({ ...w })),
    findAllPinned: () =>
      Array.from(workspaces.values())
        .filter((w) => w.pinnedAt !== null)
        .map((w) => ({ ...w })),
    findAll: () => Array.from(workspaces.values()).map((w) => ({ ...w })),
    create: (data: CreateWorkspaceData) => {
      const now = new Date().toISOString();
      const workspace: Workspace = {
        id: crypto.randomUUID(),
        taskId: data.taskId,
        repositoryId: data.repositoryId,
        mode: data.mode,
        label: data.label ?? null,
        pinnedAt: null,
        lastViewedAt: null,
        lastActivityAt: null,
        linkedBranch: null,
        createdAt: now,
        updatedAt: now,
      };
      workspaces.set(workspace.id, workspace);
      return { ...workspace };
    },
    deleteByTaskId: (taskId: string) => {
      for (const [id, w] of workspaces) {
        if (w.taskId === taskId) {
          workspaces.delete(id);
        }
      }
    },
    deleteById: (id: string) => {
      workspaces.delete(id);
    },
    updatePinnedAt: (taskId: string, pinnedAt: string | null) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId) w.pinnedAt = pinnedAt;
      }
    },
    updateLastViewedAt: (taskId: string, lastViewedAt: string) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId) w.lastViewedAt = lastViewedAt;
      }
    },
    updateLastActivityAt: (taskId: string, lastActivityAt: string) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId) w.lastActivityAt = lastActivityAt;
      }
    },
    updateMode: (taskId: string, mode: string) => {
      for (const w of workspaces.values()) {
        if (w.taskId === taskId)
          w.mode = mode as "cloud" | "local" | "worktree";
      }
    },
    deleteAll: () => {
      workspaces.clear();
    },
    updateLinkedBranch: () => {},
  };
}
