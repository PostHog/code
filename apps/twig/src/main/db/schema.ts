import { sql } from "drizzle-orm";
import {
  check,
  customType,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const uuid = customType<{ data: string; notNull: true; default: true }>({
  dataType() {
    return "text";
  },
});

const id = (name: string) =>
  uuid(name)
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  text("created_at").notNull().default(sql`(CURRENT_TIMESTAMP)`);

const updatedAt = () =>
  text("updated_at").notNull().default(sql`(CURRENT_TIMESTAMP)`);

export const repositories = sqliteTable("repositories", {
  id: id("id"),
  path: text("path").notNull().unique(),
  lastAccessedAt: text("last_accessed_at"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: id("id"),
    taskId: text("task_id").notNull(),
    repositoryId: text("repository_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    mode: text("mode", { enum: ["cloud", "local", "worktree"] }).notNull(),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    worktreeName: text("worktree_name"),
    branchName: text("branch_name"),
    checkpointId: text("checkpoint_id"),
    archivedAt: text("archived_at"),
    pinnedAt: text("pinned_at"),
    lastViewedAt: text("last_viewed_at"),
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
  id: id("id"),
  workspaceId: text("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  path: text("path").notNull(),
  branch: text("branch").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
