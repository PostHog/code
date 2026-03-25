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

export const AUTOMATION_SCHEDULES = [
  "every_15_minutes",
  "every_hour",
  "every_4_hours",
  "daily_9am",
  "daily_12pm",
  "daily_6pm",
  "weekday_mornings",
  "weekly_monday_9am",
] as const;

export const automations = sqliteTable("automations", {
  id: id(),
  name: text().notNull(),
  prompt: text().notNull(),
  schedule: text({
    enum: AUTOMATION_SCHEDULES,
  }).notNull(),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  lastRunAt: text(),
  lastRunStatus: text({ enum: ["success", "error", "running"] }),
  lastRunError: text(),
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
    status: text({ enum: ["running", "success", "error"] }).notNull(),
    output: text(),
    error: text(),
    startedAt: text().notNull(),
    completedAt: text(),
    createdAt: createdAt(),
  },
  (t) => [index("automation_runs_automation_id_idx").on(t.automationId)],
);
