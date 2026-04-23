import type { IMainWindow } from "@posthog/platform/main-window";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { DeepLinkService } from "../deep-link/service";

const log = logger.scope("task-link-service");

export const TaskLinkEvent = {
  OpenTask: "openTask",
} as const;

export interface TaskLinkEvents {
  [TaskLinkEvent.OpenTask]: { taskId: string; taskRunId?: string };
}

export interface PendingDeepLink {
  taskId: string;
  taskRunId?: string;
}

@injectable()
export class TaskLinkService extends TypedEventEmitter<TaskLinkEvents> {
  /**
   * Pending deep link that was received before renderer was ready.
   * This handles the case where the app is launched via deep link.
   */
  private pendingDeepLink: PendingDeepLink | null = null;

  constructor(
    @inject(MAIN_TOKENS.DeepLinkService)
    private readonly deepLinkService: DeepLinkService,
    @inject(MAIN_TOKENS.MainWindow)
    private readonly mainWindow: IMainWindow,
  ) {
    super();

    this.deepLinkService.registerHandler("task", (path) =>
      this.handleTaskLink(path),
    );
  }

  private handleTaskLink(path: string): boolean {
    // path formats:
    //   "abc123" from posthog-code://task/abc123
    //   "abc123/run/xyz789" from posthog-code://task/abc123/run/xyz789
    const parts = path.split("/");
    const taskId = parts[0];
    const taskRunId = parts[1] === "run" ? parts[2] : undefined;

    if (!taskId) {
      log.warn("Task link missing task ID");
      return false;
    }

    // Check if renderer is ready (has any listeners)
    const hasListeners = this.listenerCount(TaskLinkEvent.OpenTask) > 0;

    if (hasListeners) {
      log.info(
        `Emitting task link event: taskId=${taskId}, taskRunId=${taskRunId ?? "none"}`,
      );
      this.emit(TaskLinkEvent.OpenTask, { taskId, taskRunId });
    } else {
      // Renderer not ready yet - queue it for later
      log.info(
        `Queueing task link (renderer not ready): taskId=${taskId}, taskRunId=${taskRunId ?? "none"}`,
      );
      this.pendingDeepLink = { taskId, taskRunId };
    }

    // Focus the window
    log.info("Deep link focusing window", { taskId, taskRunId });
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.focus();

    return true;
  }

  /**
   * Get and clear any pending deep link.
   * Called by renderer on mount to handle deep links that arrived before it was ready.
   */
  public consumePendingDeepLink(): PendingDeepLink | null {
    const pending = this.pendingDeepLink;
    this.pendingDeepLink = null;
    if (pending) {
      log.info(
        `Consumed pending task link: taskId=${pending.taskId}, taskRunId=${pending.taskRunId ?? "none"}`,
      );
    }
    return pending;
  }
}
