import type {
  AutomationRunStatus,
  Automation as AutomationType,
} from "@shared/types/automations";
import { desc, eq } from "drizzle-orm";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { automationRuns, automations } from "../schema";
import type { DatabaseService } from "../service";

export type AutomationRow = typeof automations.$inferSelect;
export type NewAutomationRow = typeof automations.$inferInsert;
export type AutomationRunRow = typeof automationRuns.$inferSelect;
export type NewAutomationRunRow = typeof automationRuns.$inferInsert;

export interface CreateAutomationData {
  name: string;
  prompt: string;
  repoPath: string;
  repository?: string | null;
  githubIntegrationId?: number | null;
  scheduleTime: string;
  timezone: string;
  templateId?: string | null;
  enabled?: boolean;
}

export interface UpdateAutomationData {
  name?: string;
  prompt?: string;
  repoPath?: string;
  repository?: string | null;
  githubIntegrationId?: number | null;
  scheduleTime?: string;
  timezone?: string;
  templateId?: string | null;
  enabled?: boolean;
  nextRunAt?: string | null;
}

const byId = (id: string) => eq(automations.id, id);
const runByAutomationId = (automationId: string) =>
  eq(automationRuns.automationId, automationId);
const now = () => new Date().toISOString();

@injectable()
export class AutomationRepository {
  constructor(
    @inject(MAIN_TOKENS.DatabaseService)
    private readonly databaseService: DatabaseService,
  ) {}

  private get db() {
    return this.databaseService.db;
  }

  findById(id: string): AutomationRow | null {
    return this.db.select().from(automations).where(byId(id)).get() ?? null;
  }

  findAll(): AutomationRow[] {
    return this.db
      .select()
      .from(automations)
      .orderBy(desc(automations.createdAt))
      .all();
  }

  findEnabled(): AutomationRow[] {
    return this.db
      .select()
      .from(automations)
      .where(eq(automations.enabled, true))
      .all();
  }

  create(data: CreateAutomationData): AutomationRow {
    const timestamp = now();
    const id = crypto.randomUUID();
    const row: NewAutomationRow = {
      id,
      name: data.name,
      prompt: data.prompt,
      repoPath: data.repoPath,
      repository: data.repository ?? null,
      githubIntegrationId: data.githubIntegrationId ?? null,
      scheduleTime: data.scheduleTime,
      timezone: data.timezone,
      templateId: data.templateId ?? null,
      enabled: data.enabled ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.db.insert(automations).values(row).run();
    const created = this.findById(id);
    if (!created) {
      throw new Error(`Failed to create automation with id ${id}`);
    }
    return created;
  }

  update(id: string, data: UpdateAutomationData): AutomationRow {
    const updates: Partial<NewAutomationRow> = {
      updatedAt: now(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.prompt !== undefined) updates.prompt = data.prompt;
    if (data.repoPath !== undefined) updates.repoPath = data.repoPath;
    if (data.repository !== undefined) updates.repository = data.repository;
    if (data.githubIntegrationId !== undefined)
      updates.githubIntegrationId = data.githubIntegrationId;
    if (data.scheduleTime !== undefined)
      updates.scheduleTime = data.scheduleTime;
    if (data.timezone !== undefined) updates.timezone = data.timezone;
    if (data.templateId !== undefined) updates.templateId = data.templateId;
    if (data.enabled !== undefined) updates.enabled = data.enabled;
    if (data.nextRunAt !== undefined) updates.nextRunAt = data.nextRunAt;

    this.db.update(automations).set(updates).where(byId(id)).run();
    const updated = this.findById(id);
    if (!updated) {
      throw new Error(`Automation not found: ${id}`);
    }
    return updated;
  }

  updateLastRun(
    id: string,
    status: AutomationRunStatus,
    opts?: { error?: string; taskId?: string; nextRunAt?: string },
  ): void {
    this.db
      .update(automations)
      .set({
        lastRunAt: now(),
        lastRunStatus: status,
        lastError: opts?.error ?? null,
        lastTaskId: opts?.taskId ?? null,
        nextRunAt: opts?.nextRunAt ?? null,
        updatedAt: now(),
      })
      .where(byId(id))
      .run();
  }

  deleteById(id: string): void {
    this.db.delete(automations).where(byId(id)).run();
  }

  // --- Runs ---

  createRun(automationId: string): AutomationRunRow {
    const timestamp = now();
    const id = crypto.randomUUID();
    const row: NewAutomationRunRow = {
      id,
      automationId,
      status: "running",
      startedAt: timestamp,
      createdAt: timestamp,
    };
    this.db.insert(automationRuns).values(row).run();
    const created = this.db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, id))
      .get();
    if (!created) {
      throw new Error(`Failed to create automation run with id ${id}`);
    }
    return created;
  }

  completeRun(
    runId: string,
    status: "success" | "failed",
    output?: string,
    error?: string,
  ): void {
    this.db
      .update(automationRuns)
      .set({
        status,
        output: output ?? null,
        error: error ?? null,
        completedAt: now(),
      })
      .where(eq(automationRuns.id, runId))
      .run();
  }

  /** Update run timestamps for seeding purposes */
  updateRunTimestamps(
    runId: string,
    startedAt: string,
    completedAt: string,
  ): void {
    this.db
      .update(automationRuns)
      .set({ startedAt, completedAt })
      .where(eq(automationRuns.id, runId))
      .run();
  }

  findRunsByAutomationId(automationId: string, limit = 20): AutomationRunRow[] {
    return this.db
      .select()
      .from(automationRuns)
      .where(runByAutomationId(automationId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(limit)
      .all();
  }

  findRecentRuns(limit = 50): AutomationRunRow[] {
    return this.db
      .select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startedAt))
      .limit(limit)
      .all();
  }

  /** Convert a DB row to the shared Automation type */
  toAutomation(row: AutomationRow): AutomationType {
    return {
      id: row.id,
      name: row.name,
      prompt: row.prompt,
      repoPath: row.repoPath,
      repository: row.repository,
      githubIntegrationId: row.githubIntegrationId,
      scheduleTime: row.scheduleTime,
      timezone: row.timezone,
      enabled: row.enabled,
      templateId: row.templateId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      nextRunAt: row.nextRunAt,
      lastRunAt: row.lastRunAt,
      lastRunStatus: row.lastRunStatus as AutomationRunStatus | null,
      lastTaskId: row.lastTaskId,
      lastError: row.lastError,
    };
  }
}
