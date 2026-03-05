import { eq } from "drizzle-orm";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { repositories } from "../schema.js";
import type { DatabaseService } from "../service.js";

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;

export interface IRepositoryRepository {
  findAll(): Repository[];
  findById(id: string): Repository | null;
  findByPath(path: string): Repository | null;
  create(data: { path: string; id?: string }): Repository;
  upsertByPath(path: string, id?: string): Repository;
  updateLastAccessed(id: string): void;
  delete(id: string): void;
  deleteAll(): void;
}

const byId = (id: string) => eq(repositories.id, id);
const byPath = (path: string) => eq(repositories.path, path);
const now = () => new Date().toISOString();

@injectable()
export class RepositoryRepository implements IRepositoryRepository {
  constructor(
    @inject(MAIN_TOKENS.DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  findAll(): Repository[] {
    return this.db.select().from(repositories).all();
  }

  findById(id: string): Repository | null {
    return this.db.select().from(repositories).where(byId(id)).get() ?? null;
  }

  findByPath(path: string): Repository | null {
    return (
      this.db.select().from(repositories).where(byPath(path)).get() ?? null
    );
  }

  create(data: { path: string; id?: string }): Repository {
    const timestamp = now();
    const row: NewRepository = {
      id: data.id ?? crypto.randomUUID(),
      path: data.path,
      lastAccessedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db.insert(repositories).values(row).run();
    return this.findById(row.id!)!;
  }

  upsertByPath(path: string, id?: string): Repository {
    const existing = this.findByPath(path);
    if (existing) {
      this.updateLastAccessed(existing.id);
      return this.findById(existing.id)!;
    }
    return this.create({ path, id });
  }

  updateLastAccessed(id: string): void {
    const timestamp = now();
    this.db
      .update(repositories)
      .set({ lastAccessedAt: timestamp, updatedAt: timestamp })
      .where(byId(id))
      .run();
  }

  delete(id: string): void {
    this.db.delete(repositories).where(byId(id)).run();
  }

  deleteAll(): void {
    this.db.delete(repositories).run();
  }
}
