import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
    taskId: text().notNull().unique(),
    repositoryId: text().references(() => repositories.id, {
      onDelete: "set null",
    }),
    mode: text({ enum: ["cloud", "local", "worktree"] }).notNull(),
    pinnedAt: text(),
    lastViewedAt: text(),
    lastActivityAt: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("workspaces_repository_id_idx").on(t.repositoryId)],
);

export const worktrees = sqliteTable("worktrees", {
  id: id(),
  workspaceId: text()
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text().notNull(),
  path: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const archives = sqliteTable("archives", {
  id: id(),
  workspaceId: text()
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  branchName: text(),
  checkpointId: text(),
  archivedAt: text().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const suspensions = sqliteTable("suspensions", {
  id: id(),
  workspaceId: text()
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  branchName: text(),
  checkpointId: text(),
  suspendedAt: text().notNull(),
  reason: text({
    enum: ["max_worktrees", "inactivity", "manual"],
  }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const automations = sqliteTable("automations", {
  id: id(),
  name: text().notNull(),
  prompt: text().notNull(),
  repoPath: text().notNull(),
  repository: text(),
  githubIntegrationId: integer(),
  scheduleTime: text().notNull(),
  timezone: text().notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  templateId: text(),
  lastRunAt: text(),
  lastRunStatus: text({ enum: ["success", "failed", "skipped", "running"] }),
  lastTaskId: text(),
  lastError: text(),
  nextRunAt: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const automationRuns = sqliteTable(
  "automation_runs",
  {
    id: id(),
    automationId: text()
      .notNull()
      .references(() => automations.id, { onDelete: "cascade" }),
    status: text({
      enum: ["running", "success", "failed", "skipped"],
    }).notNull(),
    output: text(),
    error: text(),
    startedAt: text().notNull(),
    completedAt: text(),
    createdAt: createdAt(),
  },
  (t) => [index("automation_runs_automation_id_idx").on(t.automationId)],
);
