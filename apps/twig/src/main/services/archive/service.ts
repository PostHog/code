import type { ArchivedTask } from "@shared/types/archive";
import { inject, injectable } from "inversify";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { logger } from "../../lib/logger";
import { archiveStore } from "../../utils/store";
import type { AgentService } from "../agent/service.js";
import type { FileWatcherService } from "../file-watcher/service.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import { ArchiveTaskSaga, UnarchiveTaskSaga } from "./saga.js";
import type { ArchiveTaskInput } from "./schemas.js";

const log = logger.scope("archive");

@injectable()
export class ArchiveService {
  @inject(MAIN_TOKENS.AgentService)
  private agentService!: AgentService;

  @inject(MAIN_TOKENS.ProcessTrackingService)
  private processTracking!: ProcessTrackingService;

  async archiveTask(input: ArchiveTaskInput): Promise<ArchivedTask> {
    log.info(`Archiving task ${input.taskId}`);

    const fileWatcher = container.get<FileWatcherService>(
      MAIN_TOKENS.FileWatcherService,
    );

    const saga = new ArchiveTaskSaga(log);
    const result = await saga.run({
      input,
      agentService: this.agentService,
      processTracking: this.processTracking,
      fileWatcher,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    log.info(`Task ${input.taskId} archived successfully`);
    return result.data;
  }

  async unarchiveTask(
    taskId: string,
    recreateBranch?: boolean,
  ): Promise<{ taskId: string; worktreeName: string | null }> {
    log.info(
      `Unarchiving task ${taskId}${recreateBranch ? " (recreate branch)" : ""}`,
    );

    const fileWatcher = container.get<FileWatcherService>(
      MAIN_TOKENS.FileWatcherService,
    );

    const saga = new UnarchiveTaskSaga(log);
    const result = await saga.run({ taskId, fileWatcher, recreateBranch });

    if (!result.success) {
      throw new Error(result.error);
    }

    log.info(`Task ${taskId} unarchived successfully`);
    return result.data;
  }

  getArchivedTasks(): ArchivedTask[] {
    return archiveStore.get("archivedTasks", []);
  }

  getArchivedTaskIds(): string[] {
    return archiveStore.get("archivedTasks", []).map((t) => t.taskId);
  }

  isArchived(taskId: string): boolean {
    return archiveStore
      .get("archivedTasks", [])
      .some((t) => t.taskId === taskId);
  }
}
