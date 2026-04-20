import path from "node:path";
import type { IStoragePaths } from "@posthog/platform/storage-paths";
import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { inject, injectable, postConstruct, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../di/tokens";
import { logger } from "../utils/logger";

import * as schema from "./schema";

const log = logger.scope("database");

const MIGRATIONS_FOLDER = path.join(__dirname, "db-migrations");

@injectable()
export class DatabaseService {
  private _db: BetterSQLite3Database<typeof schema> | null = null;
  private _sqlite: InstanceType<typeof Database> | null = null;

  constructor(
    @inject(MAIN_TOKENS.StoragePaths)
    private readonly storagePaths: IStoragePaths,
  ) {}

  get db(): BetterSQLite3Database<typeof schema> {
    if (!this._db) {
      throw new Error("Database not initialized — call initialize() first");
    }
    return this._db;
  }

  @postConstruct()
  initialize(): void {
    const dbPath = path.join(this.storagePaths.appDataPath, "posthog-code.db");
    log.info("Opening database", {
      path: dbPath,
      migrationsFolder: MIGRATIONS_FOLDER,
    });

    try {
      this._sqlite = new Database(dbPath);
      this._sqlite.pragma("journal_mode = WAL");
      this._sqlite.pragma("foreign_keys = ON");
      this._db = drizzle(this._sqlite, { schema, casing: "snake_case" });
      migrate(this._db, { migrationsFolder: MIGRATIONS_FOLDER });
    } catch (error) {
      log.error("Database initialization failed", error);
      throw error;
    }
  }

  @preDestroy()
  close(): void {
    if (this._sqlite) {
      log.info("Closing database");
      this._sqlite.close();
      this._sqlite = null;
      this._db = null;
    }
  }
}
