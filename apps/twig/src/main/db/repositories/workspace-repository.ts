import { and, eq, isNotNull } from "drizzle-orm";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { workspaces } from "../schema.js";
import type { DatabaseService } from "../service.js";

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type WorkspaceMode = "cloud" | "local" | "worktree";
export type WorkspaceState = "active" | "archived";

export interface CreateActiveWorkspaceData {
  taskId: string;
  repositoryId: string | null;
  mode: WorkspaceMode;
}

export interface ArchiveWorkspaceData {
  worktreeName: string | null;
  branchName: string | null;
  checkpointId: string | null;
}

export interface IWorkspaceRepository {
  findById(id: string): Workspace | null;
  findByTaskId(taskId: string): Workspace | null;
  findActiveByTaskId(taskId: string): Workspace | null;
  findArchivedByTaskId(taskId: string): Workspace | null;
  findAllActive(): Workspace[];
  findAllArchived(): Workspace[];
  findAllActiveByRepositoryId(repositoryId: string): Workspace[];
  findAllPinned(): Workspace[];
  findAll(): Workspace[];
  createActive(data: CreateActiveWorkspaceData): Workspace;
  archive(taskId: string, data: ArchiveWorkspaceData): Workspace | null;
  unarchive(taskId: string): Workspace | null;
  deleteByTaskId(taskId: string): void;
  deleteById(id: string): void;
  updatePinnedAt(taskId: string, pinnedAt: string | null): void;
  updateLastViewedAt(taskId: string, lastViewedAt: string): void;
  updateLastActivityAt(taskId: string, lastActivityAt: string): void;
  updateMode(taskId: string, mode: WorkspaceMode): void;
  updateBranchName(taskId: string, branchName: string): void;
  deleteAll(): void;
}

const byId = (id: string) => eq(workspaces.id, id);
const byTaskId = (taskId: string) => eq(workspaces.taskId, taskId);
const byRepositoryId = (repoId: string) => eq(workspaces.repositoryId, repoId);
const isActive = eq(workspaces.state, "active");
const isArchived = eq(workspaces.state, "archived");
const isPinned = isNotNull(workspaces.pinnedAt);
const activeByTaskId = (taskId: string) => and(byTaskId(taskId), isActive);
const archivedByTaskId = (taskId: string) => and(byTaskId(taskId), isArchived);
const activeByRepoId = (repoId: string) =>
  and(byRepositoryId(repoId), isActive);
const now = () => new Date().toISOString();

@injectable()
export class WorkspaceRepository implements IWorkspaceRepository {
  constructor(
    @inject(MAIN_TOKENS.DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  findById(id: string): Workspace | null {
    return this.db.select().from(workspaces).where(byId(id)).get() ?? null;
  }

  findByTaskId(taskId: string): Workspace | null {
    return (
      this.db.select().from(workspaces).where(byTaskId(taskId)).get() ?? null
    );
  }

  findActiveByTaskId(taskId: string): Workspace | null {
    return (
      this.db.select().from(workspaces).where(activeByTaskId(taskId)).get() ??
      null
    );
  }

  findArchivedByTaskId(taskId: string): Workspace | null {
    return (
      this.db.select().from(workspaces).where(archivedByTaskId(taskId)).get() ??
      null
    );
  }

  findAllActive(): Workspace[] {
    return this.db.select().from(workspaces).where(isActive).all();
  }

  findAllArchived(): Workspace[] {
    return this.db.select().from(workspaces).where(isArchived).all();
  }

  findAllActiveByRepositoryId(repositoryId: string): Workspace[] {
    return this.db
      .select()
      .from(workspaces)
      .where(activeByRepoId(repositoryId))
      .all();
  }

  findAllPinned(): Workspace[] {
    return this.db.select().from(workspaces).where(isPinned).all();
  }

  findAll(): Workspace[] {
    return this.db.select().from(workspaces).all();
  }

  createActive(data: CreateActiveWorkspaceData): Workspace {
    const timestamp = now();
    const id = crypto.randomUUID();
    const row: NewWorkspace = {
      id,
      taskId: data.taskId,
      repositoryId: data.repositoryId,
      mode: data.mode,
      state: "active",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db.insert(workspaces).values(row).run();
    const created = this.findById(id);
    if (!created) {
      throw new Error(`Failed to create workspace with id ${id}`);
    }
    return created;
  }

  archive(taskId: string, data: ArchiveWorkspaceData): Workspace | null {
    const timestamp = now();
    this.db
      .update(workspaces)
      .set({
        state: "archived",
        archivedAt: timestamp,
        worktreeName: data.worktreeName,
        branchName: data.branchName,
        checkpointId: data.checkpointId,
        updatedAt: timestamp,
      })
      .where(activeByTaskId(taskId))
      .run();
    return this.findArchivedByTaskId(taskId);
  }

  unarchive(taskId: string): Workspace | null {
    this.db
      .update(workspaces)
      .set({
        state: "active",
        archivedAt: null,
        worktreeName: null,
        branchName: null,
        checkpointId: null,
        updatedAt: now(),
      })
      .where(archivedByTaskId(taskId))
      .run();
    return this.findActiveByTaskId(taskId);
  }

  deleteByTaskId(taskId: string): void {
    this.db.delete(workspaces).where(byTaskId(taskId)).run();
  }

  deleteById(id: string): void {
    this.db.delete(workspaces).where(byId(id)).run();
  }

  updatePinnedAt(taskId: string, pinnedAt: string | null): void {
    this.db
      .update(workspaces)
      .set({ pinnedAt, updatedAt: now() })
      .where(byTaskId(taskId))
      .run();
  }

  updateLastViewedAt(taskId: string, lastViewedAt: string): void {
    this.db
      .update(workspaces)
      .set({ lastViewedAt, updatedAt: now() })
      .where(byTaskId(taskId))
      .run();
  }

  updateLastActivityAt(taskId: string, lastActivityAt: string): void {
    this.db
      .update(workspaces)
      .set({ lastActivityAt, updatedAt: now() })
      .where(byTaskId(taskId))
      .run();
  }

  updateMode(taskId: string, mode: WorkspaceMode): void {
    this.db
      .update(workspaces)
      .set({ mode, updatedAt: now() })
      .where(activeByTaskId(taskId))
      .run();
  }

  updateBranchName(taskId: string, branchName: string): void {
    this.db
      .update(workspaces)
      .set({ branchName, updatedAt: now() })
      .where(byTaskId(taskId))
      .run();
  }

  deleteAll(): void {
    this.db.delete(workspaces).run();
  }
}
