import type { IMainWindow } from "@posthog/platform/main-window";
import type { INotifier } from "@posthog/platform/notifier";
import { inject, injectable, postConstruct } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TaskLinkEvent, type TaskLinkService } from "../task-link/service";

const log = logger.scope("notification");

@injectable()
export class NotificationService {
  private hasBadge = false;

  constructor(
    @inject(MAIN_TOKENS.TaskLinkService)
    private readonly taskLinkService: TaskLinkService,
    @inject(MAIN_TOKENS.Notifier)
    private readonly notifier: INotifier,
    @inject(MAIN_TOKENS.MainWindow)
    private readonly mainWindow: IMainWindow,
  ) {}

  @postConstruct()
  init(): void {
    this.mainWindow.onFocus(() => this.clearDockBadge());
  }

  send(title: string, body: string, silent: boolean, taskId?: string): void {
    if (!this.notifier.isSupported()) {
      log.warn("Notifications not supported on this platform");
      return;
    }

    this.notifier.notify({
      title,
      body,
      silent,
      onClick: () => {
        log.info("Notification clicked, focusing window", { title, taskId });
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.focus();

        if (taskId) {
          this.taskLinkService.emit(TaskLinkEvent.OpenTask, { taskId });
          log.info("Notification clicked, navigating to task", { taskId });
        }
      },
    });
    log.info("Notification sent", { title, body, silent, taskId });
  }

  showDockBadge(): void {
    if (this.hasBadge) return;
    this.hasBadge = true;
    this.notifier.setUnreadIndicator(true);
    log.info("Dock badge shown");
  }

  bounceDock(): void {
    this.notifier.requestAttention();
    log.info("Dock bounce triggered");
  }

  private clearDockBadge(): void {
    if (!this.hasBadge) return;
    this.hasBadge = false;
    this.notifier.setUnreadIndicator(false);
    log.info("Dock badge cleared");
  }
}
