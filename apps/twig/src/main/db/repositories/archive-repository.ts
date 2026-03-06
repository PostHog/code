import { eq } from "drizzle-orm";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { archives } from "../schema.js";
import type { DatabaseService } from "../service.js";

export type Archive = typeof archives.$inferSelect;
export type NewArchive = typeof archives.$inferInsert;

export interface CreateArchiveData {
  workspaceId: string;
  branchName: string | null;
  checkpointId: string | null;
}

export interface IArchiveRepository {
  findById(id: string): Archive | null;
  findByWorkspaceId(workspaceId: string): Archive | null;
  findAll(): Archive[];
  create(data: CreateArchiveData): Archive;
  deleteByWorkspaceId(workspaceId: string): void;
  deleteAll(): void;
}

const byId = (id: string) => eq(archives.id, id);
const byWorkspaceId = (wsId: string) => eq(archives.workspaceId, wsId);
const now = () => new Date().toISOString();

@injectable()
export class ArchiveRepository implements IArchiveRepository {
  constructor(
    @inject(MAIN_TOKENS.DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  findById(id: string): Archive | null {
    return this.db.select().from(archives).where(byId(id)).get() ?? null;
  }

  findByWorkspaceId(workspaceId: string): Archive | null {
    return (
      this.db.select().from(archives).where(byWorkspaceId(workspaceId)).get() ??
      null
    );
  }

  findAll(): Archive[] {
    return this.db.select().from(archives).all();
  }

  create(data: CreateArchiveData): Archive {
    const timestamp = now();
    const id = crypto.randomUUID();
    const row: NewArchive = {
      id,
      workspaceId: data.workspaceId,
      branchName: data.branchName,
      checkpointId: data.checkpointId,
      archivedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db.insert(archives).values(row).run();
    const created = this.findById(id);
    if (!created) {
      throw new Error(`Failed to create archive with id ${id}`);
    }
    return created;
  }

  deleteByWorkspaceId(workspaceId: string): void {
    this.db.delete(archives).where(byWorkspaceId(workspaceId)).run();
  }

  deleteAll(): void {
    this.db.delete(archives).run();
  }
}
