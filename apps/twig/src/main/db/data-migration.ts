import { eq } from "drizzle-orm";
import { inject, injectable } from "inversify";
import type { ArchivedTask } from "../../shared/types/archive.js";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
} from "../../shared/types.js";
import { MAIN_TOKENS } from "../di/tokens.js";
import { logger } from "../utils/logger.js";
import { archiveStore, foldersStore } from "../utils/store.js";
import type { RepositoryRepository } from "./repositories/repository-repository.js";
import type { WorkspaceRepository } from "./repositories/workspace-repository.js";
import { appMeta } from "./schema.js";
import type { DatabaseService } from "./service.js";

const log = logger.scope("data-migration");

const MIGRATION_KEY = "json_to_sqlite_migrated";

@injectable()
export class DataMigrationService {
  constructor(
    @inject(MAIN_TOKENS.DatabaseService)
    private readonly databaseService: DatabaseService,
    @inject(MAIN_TOKENS.RepositoryRepository)
    private readonly repositoryRepo: RepositoryRepository,
    @inject(MAIN_TOKENS.WorkspaceRepository)
    private readonly workspaceRepo: WorkspaceRepository,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  private hasMigrated(): boolean {
    const row = this.db
      .select()
      .from(appMeta)
      .where(eq(appMeta.key, MIGRATION_KEY))
      .get();
    return row?.value === "true";
  }

  private markMigrated(): void {
    this.db
      .insert(appMeta)
      .values({ key: MIGRATION_KEY, value: "true" })
      .onConflictDoUpdate({
        target: appMeta.key,
        set: { value: "true" },
      })
      .run();
  }

  migrate(): void {
    if (this.hasMigrated()) {
      log.info("Data migration already completed, skipping");
      return;
    }

    log.info("Starting JSON to SQLite data migration");

    try {
      const folders = foldersStore.get("folders", []) as RegisteredFolder[];
      const taskAssociations = foldersStore.get(
        "taskAssociations",
        [],
      ) as TaskFolderAssociation[];
      const archivedTasks = archiveStore.get(
        "archivedTasks",
        [],
      ) as ArchivedTask[];

      log.info("Migration data loaded", {
        folders: folders.length,
        taskAssociations: taskAssociations.length,
        archivedTasks: archivedTasks.length,
      });

      const folderIdToRepoId = new Map<string, string>();
      for (const folder of folders) {
        try {
          const repo = this.repositoryRepo.upsertByPath(folder.path);
          folderIdToRepoId.set(folder.id, repo.id);
          log.debug("Migrated folder to repository", {
            folderId: folder.id,
            path: folder.path,
            repositoryId: repo.id,
          });
        } catch (error) {
          log.error("Failed to migrate folder", { folder, error });
        }
      }

      for (const assoc of taskAssociations) {
        try {
          const repositoryId = folderIdToRepoId.get(assoc.folderId) ?? null;
          const mode = assoc.mode === "worktree" ? "worktree" : assoc.mode;

          this.workspaceRepo.createActive({
            taskId: assoc.taskId,
            repositoryId,
            mode,
          });

          log.debug("Migrated active workspace", {
            taskId: assoc.taskId,
            mode,
          });
        } catch (error) {
          log.error("Failed to migrate task association", { assoc, error });
        }
      }

      for (const archived of archivedTasks) {
        try {
          const repositoryId = folderIdToRepoId.get(archived.folderId) ?? null;
          const existingActive = this.workspaceRepo.findActiveByTaskId(
            archived.taskId,
          );

          if (existingActive) {
            this.workspaceRepo.archive(archived.taskId, {
              worktreeName: archived.worktreeName,
              branchName: archived.branchName,
              checkpointId: archived.checkpointId,
            });
          } else {
            const mode =
              archived.mode === "worktree" ? "worktree" : archived.mode;
            this.workspaceRepo.createActive({
              taskId: archived.taskId,
              repositoryId,
              mode,
            });
            this.workspaceRepo.archive(archived.taskId, {
              worktreeName: archived.worktreeName,
              branchName: archived.branchName,
              checkpointId: archived.checkpointId,
            });
          }

          log.debug("Migrated archived task", {
            taskId: archived.taskId,
            mode: archived.mode,
          });
        } catch (error) {
          log.error("Failed to migrate archived task", { archived, error });
        }
      }

      this.markMigrated();
      log.info("Data migration completed successfully");
    } catch (error) {
      log.error("Data migration failed", error);
      throw error;
    }
  }
}
