import { tmpdir } from "node:os";
import type {
  AutomationInfo,
  AutomationRunInfo,
  AutomationSchedule,
} from "@shared/types/automations";
import { powerMonitor } from "electron";
import { inject, injectable, postConstruct, preDestroy } from "inversify";
import type {
  Automation,
  AutomationRepository,
  AutomationRun,
} from "../../db/repositories/automation-repository";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { AgentService } from "../agent/service";
import { getDelayMs, getNextRunTime } from "./scheduler";

const log = logger.scope("automation-service");

export const AutomationServiceEvent = {
  AutomationCreated: "automation-created",
  AutomationUpdated: "automation-updated",
  AutomationDeleted: "automation-deleted",
  RunStarted: "run-started",
  RunCompleted: "run-completed",
} as const;

export interface AutomationServiceEvents {
  [AutomationServiceEvent.AutomationCreated]: AutomationInfo;
  [AutomationServiceEvent.AutomationUpdated]: AutomationInfo;
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

    // Reschedule timers after system wake
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

    // If we have credentials and no jobs scheduled, load from DB
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
    schedule: AutomationSchedule;
  }): AutomationInfo {
    const automation = this.repo.create({
      name: data.name,
      prompt: data.prompt,
      schedule: data.schedule,
      enabled: true,
    });
    const info = this.toAutomationInfo(automation);
    this.scheduleJob(automation);
    this.emit(AutomationServiceEvent.AutomationCreated, info);
    log.info("Created automation", { id: automation.id, name: data.name });
    return info;
  }

  update(
    id: string,
    data: {
      name?: string;
      prompt?: string;
      schedule?: AutomationSchedule;
      enabled?: boolean;
    },
  ): AutomationInfo {
    const automation = this.repo.update(id, data);
    const info = this.toAutomationInfo(automation);

    // Reschedule the job
    this.cancelJob(id);
    if (automation.enabled) {
      this.scheduleJob(automation);
    }

    this.emit(AutomationServiceEvent.AutomationUpdated, info);
    log.info("Updated automation", { id, ...data });
    return info;
  }

  delete(id: string): void {
    this.cancelJob(id);
    this.repo.deleteById(id);
    this.emit(AutomationServiceEvent.AutomationDeleted, { id });
    log.info("Deleted automation", { id });
  }

  list(): AutomationInfo[] {
    return this.repo.findAll().map((a) => this.toAutomationInfo(a));
  }

  getById(id: string): AutomationInfo | null {
    const automation = this.repo.findById(id);
    return automation ? this.toAutomationInfo(automation) : null;
  }

  getRuns(automationId: string, limit = 20): AutomationRunInfo[] {
    return this.repo
      .findRunsByAutomationId(automationId, limit)
      .map(this.toRunInfo);
  }

  getRecentRuns(limit = 50): AutomationRunInfo[] {
    return this.repo.findRecentRuns(limit).map(this.toRunInfo);
  }

  /** Manually trigger an automation right now */
  async triggerNow(id: string): Promise<AutomationRunInfo> {
    const automation = this.repo.findById(id);
    if (!automation) {
      throw new Error(`Automation not found: ${id}`);
    }
    return this.executeAutomation(automation);
  }

  // --- Scheduling ---

  private loadAndScheduleAll(): void {
    const automations = this.repo.findEnabled();
    log.info("Loading automations", { count: automations.length });
    for (const automation of automations) {
      this.scheduleJob(automation);
    }
  }

  private rescheduleAll(): void {
    this.cancelAllJobs();
    if (this.credentials) {
      this.loadAndScheduleAll();
    }
  }

  private scheduleJob(automation: Automation): void {
    if (!automation.enabled) return;

    const nextRunAt = getNextRunTime(automation.schedule as AutomationSchedule);
    const delayMs = getDelayMs(automation.schedule as AutomationSchedule);

    log.info("Scheduling automation", {
      id: automation.id,
      name: automation.name,
      schedule: automation.schedule,
      nextRunAt: nextRunAt.toISOString(),
      delayMs,
    });

    const timer = setTimeout(() => {
      this.onJobFired(automation.id);
    }, delayMs);

    // Prevent the timer from keeping the process alive
    timer.unref();

    this.jobs.set(automation.id, {
      automationId: automation.id,
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
    for (const [id, job] of this.jobs) {
      clearTimeout(job.timer);
      this.jobs.delete(id);
    }
  }

  private async onJobFired(automationId: string): Promise<void> {
    // Remove the expired job entry
    this.jobs.delete(automationId);

    // Re-read from DB in case it was updated/deleted
    const automation = this.repo.findById(automationId);
    if (!automation || !automation.enabled) {
      log.info("Automation disabled or deleted, skipping", { automationId });
      return;
    }

    // Skip if already running
    if (this.runningAutomations.has(automationId)) {
      log.warn("Automation already running, skipping", { automationId });
      this.scheduleJob(automation);
      return;
    }

    try {
      await this.executeAutomation(automation);
    } catch (err) {
      log.error("Failed to execute automation", {
        automationId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Reschedule for the next run (re-read from DB in case it changed)
    const current = this.repo.findById(automationId);
    if (current?.enabled) {
      this.scheduleJob(current);
    }
  }

  // --- Execution ---

  private async executeAutomation(
    automation: Automation,
  ): Promise<AutomationRunInfo> {
    if (!this.credentials) {
      throw new Error("No credentials available for automation execution");
    }

    this.runningAutomations.add(automation.id);
    this.repo.updateLastRun(automation.id, "running");

    const run = this.repo.createRun({ automationId: automation.id });
    const runInfo = this.toRunInfo(run);
    this.emit(AutomationServiceEvent.RunStarted, runInfo);

    log.info("Executing automation", {
      automationId: automation.id,
      name: automation.name,
      runId: run.id,
    });

    try {
      const output = await this.runAgent(automation.prompt);

      this.repo.completeRun(run.id, "success", output);
      this.repo.updateLastRun(automation.id, "success");

      const completedRun = this.toRunInfo({
        ...run,
        status: "success",
        output,
        completedAt: new Date().toISOString(),
      });
      this.emit(AutomationServiceEvent.RunCompleted, completedRun);

      log.info("Automation completed successfully", {
        automationId: automation.id,
        runId: run.id,
      });
      return completedRun;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.repo.completeRun(run.id, "error", undefined, errorMsg);
      this.repo.updateLastRun(automation.id, "error", errorMsg);

      const failedRun = this.toRunInfo({
        ...run,
        status: "error",
        error: errorMsg,
        completedAt: new Date().toISOString(),
      });
      this.emit(AutomationServiceEvent.RunCompleted, failedRun);

      log.error("Automation failed", {
        automationId: automation.id,
        runId: run.id,
        error: errorMsg,
      });
      return failedRun;
    } finally {
      this.runningAutomations.delete(automation.id);
    }
  }

  private async runAgent(prompt: string): Promise<string> {
    if (!this.credentials) {
      throw new Error("No credentials available");
    }

    const taskId = `automation-${crypto.randomUUID()}`;
    const taskRunId = `${taskId}:run`;

    try {
      // Start a new agent session with bypassPermissions mode
      // so it runs fully autonomously
      const session = await this.agentService.startSession({
        taskId,
        taskRunId,
        repoPath: tmpdir(),
        apiKey: this.credentials.apiKey,
        apiHost: this.credentials.apiHost,
        projectId: this.credentials.projectId,
        permissionMode: "bypassPermissions",
        adapter: "claude",
      });

      // Send the automation prompt
      const result = await this.agentService.prompt(session.sessionId, [
        {
          type: "text",
          text: prompt,
        },
      ]);

      // Collect response text from session events
      // For now, return the stop reason as a simple status
      return `Completed with stop reason: ${result.stopReason}`;
    } finally {
      // Clean up the session
      try {
        await this.agentService.cancelSession(taskRunId);
      } catch {
        // Session may already be cleaned up
      }
    }
  }

  // --- Conversion helpers ---

  private toAutomationInfo(automation: Automation): AutomationInfo {
    const job = this.jobs.get(automation.id);
    return {
      id: automation.id,
      name: automation.name,
      prompt: automation.prompt,
      schedule: automation.schedule as AutomationSchedule,
      enabled: automation.enabled,
      lastRunAt: automation.lastRunAt,
      lastRunStatus:
        automation.lastRunStatus as AutomationInfo["lastRunStatus"],
      lastRunError: automation.lastRunError,
      nextRunAt: job ? job.nextRunAt.toISOString() : null,
      createdAt: automation.createdAt,
      updatedAt: automation.updatedAt,
    };
  }

  private toRunInfo(run: AutomationRun): AutomationRunInfo {
    return {
      id: run.id,
      automationId: run.automationId,
      status: run.status,
      output: run.output,
      error: run.error,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
  }
}
