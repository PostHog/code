import { sql } from "drizzle-orm";
import { check, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () => text().notNull().default(sql`(CURRENT_TIMESTAMP)`);
const updatedAt = () => text().notNull().default(sql`(CURRENT_TIMESTAMP)`);

export const repositories = sqliteTable("repositories", {
  id: id(),
  path: text().notNull().unique(),
  remoteUrl: text(),
  lastAccessedAt: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: id(),
    taskId: text().notNull(),
    repositoryId: text().references(() => repositories.id, {
      onDelete: "set null",
    }),
    mode: text({ enum: ["cloud", "local", "worktree"] }).notNull(),
    state: text({ enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    worktreeName: text(),
    branchName: text(),
    checkpointId: text(),
    archivedAt: text(),
    pinnedAt: text(),
    lastViewedAt: text(),
    lastActivityAt: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("workspaces_active_task_id_unique")
      .on(table.taskId)
      .where(sql`${table.state} = 'active'`),
    check(
      "workspaces_active_archive_fields_null",
      sql`${table.state} = 'archived' OR (
        ${table.worktreeName} IS NULL AND
        ${table.branchName} IS NULL AND
        ${table.checkpointId} IS NULL AND
        ${table.archivedAt} IS NULL
      )`,
    ),
    check(
      "workspaces_archived_at_required",
      sql`(${table.state} = 'active' AND ${table.archivedAt} IS NULL) OR
          (${table.state} = 'archived' AND ${table.archivedAt} IS NOT NULL)`,
    ),
  ],
);

export const worktrees = sqliteTable("worktrees", {
  id: id(),
  workspaceId: text()
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text().notNull(),
  path: text().notNull(),
  branch: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const appMeta = sqliteTable("app_meta", {
  key: text().primaryKey(),
  value: text(),
  createdAt: createdAt(),
});
