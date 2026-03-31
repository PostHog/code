import { app, Notification } from "electron";
import { inject, injectable, postConstruct } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { getMainWindow } from "../../trpc/context";
import { logger } from "../../utils/logger";
import { TaskLinkEvent, type TaskLinkService } from "../task-link/service";

const log = logger.scope("notification");

@injectable()
export class NotificationService {
  private hasBadge = false;

  constructor(
    @inject(MAIN_TOKENS.TaskLinkService)
    private readonly taskLinkService: TaskLinkService,
  ) {}

  @postConstruct()
  init(): void {
    app.on("browser-window-focus", () => this.clearDockBadge());
    log.info("Notification service initialized");
  }

  send(title: string, body: string, silent: boolean, taskId?: string): void {
    if (!Notification.isSupported()) {
      log.warn("Notifications not supported on this platform");
      return;
    }

    const notification = new Notification({ title, body, silent });

    notification.on("click", () => {
      log.info("Notification clicked, focusing window", { title, taskId });
      const mainWindow = getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow.focus();
      }

      if (taskId) {
        this.taskLinkService.emit(TaskLinkEvent.OpenTask, { taskId });
        log.info("Notification clicked, navigating to task", { taskId });
      }
    });

    notification.show();
    log.info("Notification sent", { title, body, silent, taskId });
  }

  showDockBadge(): void {
    if (this.hasBadge) return;

    this.hasBadge = true;
    if (process.platform === "darwin" || process.platform === "linux") {
      app.dock?.setBadge("•");
    } else if (process.platform === "win32") {
      getMainWindow()?.flashFrame(true);
    }
    log.info("Dock badge shown");
  }

  bounceDock(): void {
    if (process.platform === "darwin") {
      app.dock?.bounce("informational");
    } else if (process.platform === "win32") {
      getMainWindow()?.flashFrame(true);
    }
    log.info("Dock bounce triggered");
  }

  private clearDockBadge(): void {
    if (!this.hasBadge) return;

    this.hasBadge = false;
    if (process.platform === "darwin" || process.platform === "linux") {
      app.dock?.setBadge("");
    } else if (process.platform === "win32") {
      getMainWindow()?.flashFrame(false);
    }
    log.info("Dock badge cleared");
  }
}
