import { desc, eq } from "drizzle-orm";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { automationRuns, automations } from "../schema";
import type { DatabaseService } from "../service";

export type Automation = typeof automations.$inferSelect;
export type NewAutomation = typeof automations.$inferInsert;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type NewAutomationRun = typeof automationRuns.$inferInsert;

export interface CreateAutomationData {
  name: string;
  prompt: string;
  schedule: Automation["schedule"];
  enabled?: boolean;
}

export interface UpdateAutomationData {
  name?: string;
  prompt?: string;
  schedule?: Automation["schedule"];
  enabled?: boolean;
}

export interface CreateRunData {
  automationId: string;
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

  findById(id: string): Automation | null {
    return this.db.select().from(automations).where(byId(id)).get() ?? null;
  }

  findAll(): Automation[] {
    return this.db
      .select()
      .from(automations)
      .orderBy(desc(automations.createdAt))
      .all();
  }

  findEnabled(): Automation[] {
    return this.db
      .select()
      .from(automations)
      .where(eq(automations.enabled, true))
      .all();
  }

  create(data: CreateAutomationData): Automation {
    const timestamp = now();
    const id = crypto.randomUUID();
    const row: NewAutomation = {
      id,
      name: data.name,
      prompt: data.prompt,
      schedule: data.schedule,
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

  update(id: string, data: UpdateAutomationData): Automation {
    const updates: Partial<NewAutomation> = {
      updatedAt: now(),
    };
    if (data.name !== undefined) updates.name = data.name;
    if (data.prompt !== undefined) updates.prompt = data.prompt;
    if (data.schedule !== undefined) updates.schedule = data.schedule;
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    this.db.update(automations).set(updates).where(byId(id)).run();
    const updated = this.findById(id);
    if (!updated) {
      throw new Error(`Automation not found: ${id}`);
    }
    return updated;
  }

  updateLastRun(
    id: string,
    status: "success" | "error" | "running",
    error?: string,
  ): void {
    this.db
      .update(automations)
      .set({
        lastRunAt: now(),
        lastRunStatus: status,
        lastRunError: error ?? null,
        updatedAt: now(),
      })
      .where(byId(id))
      .run();
  }

  deleteById(id: string): void {
    this.db.delete(automations).where(byId(id)).run();
  }

  // --- Runs ---

  createRun(data: CreateRunData): AutomationRun {
    const timestamp = now();
    const id = crypto.randomUUID();
    const row: NewAutomationRun = {
      id,
      automationId: data.automationId,
      status: "running",
      startedAt: timestamp,
      createdAt: timestamp,
    };
    this.db.insert(automationRuns).values(row).run();
    return this.db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.id, id))
      .get()!;
  }

  completeRun(
    runId: string,
    status: "success" | "error",
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

  findRunsByAutomationId(automationId: string, limit = 20): AutomationRun[] {
    return this.db
      .select()
      .from(automationRuns)
      .where(runByAutomationId(automationId))
      .orderBy(desc(automationRuns.startedAt))
      .limit(limit)
      .all();
  }

  findRecentRuns(limit = 50): AutomationRun[] {
    return this.db
      .select()
      .from(automationRuns)
      .orderBy(desc(automationRuns.startedAt))
      .limit(limit)
      .all();
  }
}
