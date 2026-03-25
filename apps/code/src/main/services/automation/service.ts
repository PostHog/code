import { tmpdir } from "node:os";
import type {
  Automation,
  AutomationRunInfo,
  AutomationRunStatus,
} from "@shared/types/automations";
import { powerMonitor } from "electron";
import { inject, injectable, postConstruct, preDestroy } from "inversify";
import type {
  AutomationRepository,
  AutomationRow,
} from "../../db/repositories/automation-repository";
import { MAIN_TOKENS } from "../../di/tokens";
import { isDevBuild } from "../../utils/env";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { AgentService } from "../agent/service";
import { computeNextRunAt, getDelayMs } from "./scheduler";
import { DEMO_OUTPUTS, seedExampleData } from "./seed-data";

const log = logger.scope("automation-service");

export const AutomationServiceEvent = {
  AutomationCreated: "automation-created",
  AutomationUpdated: "automation-updated",
  AutomationDeleted: "automation-deleted",
  RunStarted: "run-started",
  RunCompleted: "run-completed",
} as const;

export interface AutomationServiceEvents {
  [AutomationServiceEvent.AutomationCreated]: Automation;
  [AutomationServiceEvent.AutomationUpdated]: Automation;
  [AutomationServiceEvent.AutomationDeleted]: { id: string };
  [AutomationServiceEvent.RunStarted]: AutomationRunInfo;
  [AutomationServiceEvent.RunCompleted]: AutomationRunInfo;
}

interface ScheduledJob {
  automationId: string;
  timer: ReturnType<typeof setTimeout>;
  nextRunAt: Date;
}

/** Credentials needed to start an agent session for automations */
export interface AutomationCredentials {
  apiKey: string;
  apiHost: string;
  projectId: number;
}

@injectable()
export class AutomationService extends TypedEventEmitter<AutomationServiceEvents> {
  private jobs = new Map<string, ScheduledJob>();
  private runningAutomations = new Set<string>();
  private credentials: AutomationCredentials | null = null;

  constructor(
    @inject(MAIN_TOKENS.AutomationRepository)
    private readonly repo: AutomationRepository,
    @inject(MAIN_TOKENS.AgentService)
    private readonly agentService: AgentService,
  ) {
    super();
  }

  @postConstruct()
  init(): void {
    log.info("Initializing automation service");

    if (isDevBuild()) {
      seedExampleData(this.repo);
    }

    powerMonitor.on("resume", () => {
      log.info("System resumed, rescheduling automations");
      this.rescheduleAll();
    });
  }

  /**
   * Store credentials for running automations.
   * Called from the renderer when auth state changes.
   */
  setCredentials(creds: AutomationCredentials): void {
    this.credentials = creds;
    if (this.jobs.size === 0) {
      this.loadAndScheduleAll();
    }
  }

  clearCredentials(): void {
    this.credentials = null;
    this.cancelAllJobs();
  }

  @preDestroy()
  shutdown(): void {
    log.info("Shutting down automation service");
    this.cancelAllJobs();
  }

  // --- CRUD ---

  create(data: {
    name: string;
    prompt: string;
    repoPath: string;
    repository?: string | null;
    githubIntegrationId?: number | null;
    scheduleTime: string;
    timezone: string;
    templateId?: string | null;
  }): Automation {
    const row = this.repo.create({
      name: data.name,
      prompt: data.prompt,
      repoPath: data.repoPath,
      repository: data.repository,
      githubIntegrationId: data.githubIntegrationId,
      scheduleTime: data.scheduleTime,
      timezone: data.timezone,
      templateId: data.templateId,
      enabled: true,
    });
    const automation = this.repo.toAutomation(row);
    this.scheduleJob(row);
    this.emit(AutomationServiceEvent.AutomationCreated, automation);
    log.info("Created automation", { id: row.id, name: data.name });
    return automation;
  }

  update(
    id: string,
    data: {
      name?: string;
      prompt?: string;
      repoPath?: string;
      repository?: string | null;
      githubIntegrationId?: number | null;
      scheduleTime?: string;
      timezone?: string;
      templateId?: string | null;
      enabled?: boolean;
    },
  ): Automation {
    const row = this.repo.update(id, data);
    const automation = this.repo.toAutomation(row);

    this.cancelJob(id);
    if (row.enabled) {
      this.scheduleJob(row);
    }

    this.emit(AutomationServiceEvent.AutomationUpdated, automation);
    log.info("Updated automation", { id });
    return automation;
  }

  delete(id: string): void {
    this.cancelJob(id);
    this.repo.deleteById(id);
    this.emit(AutomationServiceEvent.AutomationDeleted, { id });
    log.info("Deleted automation", { id });
  }

  list(): Automation[] {
    return this.repo.findAll().map((row) => this.repo.toAutomation(row));
  }

  getById(id: string): Automation | null {
    const row = this.repo.findById(id);
    return row ? this.repo.toAutomation(row) : null;
  }

  getRuns(automationId: string, limit = 20): AutomationRunInfo[] {
    return this.repo.findRunsByAutomationId(automationId, limit).map(toRunInfo);
  }

  getRecentRuns(limit = 50): AutomationRunInfo[] {
    return this.repo.findRecentRuns(limit).map(toRunInfo);
  }

  /** Manually trigger an automation right now */
  triggerNow(id: string): AutomationRunInfo {
    const row = this.repo.findById(id);
    if (!row) {
      throw new Error(`Automation not found: ${id}`);
    }

    // Use demo output for instant results (real agent execution comes later)
    const outputs = DEMO_OUTPUTS[row.templateId ?? ""] ?? [
      `Automation "${row.name}" completed successfully. No specific template output available.`,
    ];
    const output = outputs[Math.floor(Math.random() * outputs.length)];

    const run = this.repo.createRun(row.id);

    // Emit RunStarted so the Command Center auto-populates the cell
    const startInfo = toRunInfo(run);
    this.emit(AutomationServiceEvent.RunStarted, startInfo);

    this.repo.completeRun(run.id, "success", output);
    this.repo.updateLastRun(row.id, "success");

    const runInfo = toRunInfo({
      ...run,
      status: "success",
      output,
      completedAt: new Date().toISOString(),
    });
    this.emit(AutomationServiceEvent.RunCompleted, runInfo);
    log.info("Triggered automation", { id, runId: run.id });
    return runInfo;
  }

  /**
   * Trigger all enabled automations at once.
   * Uses demo output based on templateId for instant results.
   */
  triggerAll(): AutomationRunInfo[] {
    const rows = this.repo.findEnabled();
    const results: AutomationRunInfo[] = [];

    for (const row of rows) {
      const outputs = DEMO_OUTPUTS[row.templateId ?? ""] ?? [
        `Automation "${row.name}" completed successfully. No specific template output available.`,
      ];
      const output = outputs[Math.floor(Math.random() * outputs.length)];

      const run = this.repo.createRun(row.id);

      // Emit RunStarted so the Command Center auto-populates the cell
      this.emit(AutomationServiceEvent.RunStarted, toRunInfo(run));

      this.repo.completeRun(run.id, "success", output);
      this.repo.updateLastRun(row.id, "success");

      const runInfo = toRunInfo({
        ...run,
        status: "success",
        output,
        completedAt: new Date().toISOString(),
      });
      results.push(runInfo);
      this.emit(AutomationServiceEvent.RunCompleted, runInfo);
    }

    log.info("Triggered all automations", { count: results.length });
    return results;
  }

  // --- Scheduling ---

  private loadAndScheduleAll(): void {
    const rows = this.repo.findEnabled();
    log.info("Loading automations", { count: rows.length });
    for (const row of rows) {
      this.scheduleJob(row);
    }
  }

  private rescheduleAll(): void {
    this.cancelAllJobs();
    if (this.credentials) {
      this.loadAndScheduleAll();
    }
  }

  private scheduleJob(row: AutomationRow): void {
    if (!row.enabled) return;

    const nextRunAt = computeNextRunAt(row.scheduleTime, row.timezone);
    const delayMs = getDelayMs(row.scheduleTime, row.timezone);

    log.info("Scheduling automation", {
      id: row.id,
      name: row.name,
      scheduleTime: row.scheduleTime,
      timezone: row.timezone,
      nextRunAt: nextRunAt.toISOString(),
      delayMs,
    });

    // Persist nextRunAt so the UI can show it
    this.repo.update(row.id, { nextRunAt: nextRunAt.toISOString() });

    const timer = setTimeout(() => {
      this.onJobFired(row.id);
    }, delayMs);

    timer.unref();

    this.jobs.set(row.id, {
      automationId: row.id,
      timer,
      nextRunAt,
    });
  }

  private cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      clearTimeout(job.timer);
      this.jobs.delete(id);
    }
  }

  private cancelAllJobs(): void {
    for (const [, job] of this.jobs) {
      clearTimeout(job.timer);
    }
    this.jobs.clear();
  }

  private async onJobFired(automationId: string): Promise<void> {
    this.jobs.delete(automationId);

    const row = this.repo.findById(automationId);
    if (!row || !row.enabled) {
      log.info("Automation disabled or deleted, skipping", { automationId });
      return;
    }

    if (this.runningAutomations.has(automationId)) {
      log.warn("Automation already running, skipping", { automationId });
      this.scheduleJob(row);
      return;
    }

    try {
      await this.executeAutomation(row);
    } catch (err) {
      log.error("Failed to execute automation", {
        automationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Reschedule
    const current = this.repo.findById(automationId);
    if (current?.enabled) {
      this.scheduleJob(current);
    }
  }

  // --- Execution ---

  private async executeAutomation(
    row: AutomationRow,
  ): Promise<AutomationRunInfo> {
    if (!this.credentials) {
      throw new Error("No credentials available for automation execution");
    }

    this.runningAutomations.add(row.id);
    this.repo.updateLastRun(row.id, "running");

    const run = this.repo.createRun(row.id);
    const runInfo = toRunInfo(run);
    this.emit(AutomationServiceEvent.RunStarted, runInfo);

    log.info("Executing automation", {
      automationId: row.id,
      name: row.name,
      runId: run.id,
    });

    try {
      const output = await this.runAgent(row.prompt, row.repoPath);

      this.repo.completeRun(run.id, "success", output);
      this.repo.updateLastRun(row.id, "success");

      const completed: AutomationRunInfo = {
        ...runInfo,
        status: "success",
        output,
        completedAt: new Date().toISOString(),
      };
      this.emit(AutomationServiceEvent.RunCompleted, completed);
      log.info("Automation completed", { automationId: row.id, runId: run.id });
      return completed;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.repo.completeRun(run.id, "failed", undefined, errorMsg);
      this.repo.updateLastRun(row.id, "failed", { error: errorMsg });

      const failed: AutomationRunInfo = {
        ...runInfo,
        status: "failed",
        error: errorMsg,
        completedAt: new Date().toISOString(),
      };
      this.emit(AutomationServiceEvent.RunCompleted, failed);
      log.error("Automation failed", {
        automationId: row.id,
        runId: run.id,
        error: errorMsg,
      });
      return failed;
    } finally {
      this.runningAutomations.delete(row.id);
    }
  }

  private async runAgent(prompt: string, repoPath: string): Promise<string> {
    if (!this.credentials) {
      throw new Error("No credentials available");
    }

    const taskId = `automation-${crypto.randomUUID()}`;
    const taskRunId = `${taskId}:run`;

    try {
      const session = await this.agentService.startSession({
        taskId,
        taskRunId,
        repoPath: repoPath || tmpdir(),
        apiKey: this.credentials.apiKey,
        apiHost: this.credentials.apiHost,
        projectId: this.credentials.projectId,
        permissionMode: "bypassPermissions",
        adapter: "claude",
      });

      const result = await this.agentService.prompt(session.sessionId, [
        { type: "text", text: prompt },
      ]);

      return `Completed with stop reason: ${result.stopReason}`;
    } finally {
      try {
        await this.agentService.cancelSession(taskRunId);
      } catch {
        // Session may already be cleaned up
      }
    }
  }
}

function toRunInfo(run: {
  id: string;
  automationId: string;
  status: string;
  output: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}): AutomationRunInfo {
  return {
    id: run.id,
    automationId: run.automationId,
    status: run.status as AutomationRunStatus,
    output: run.output,
    error: run.error,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  };
}
