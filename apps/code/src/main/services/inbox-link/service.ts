import type { IMainWindow } from "@posthog/platform/main-window";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { DeepLinkService } from "../deep-link/service";

const log = logger.scope("inbox-link-service");

export const InboxLinkEvent = {
  OpenReport: "openReport",
} as const;

export interface InboxLinkEvents {
  [InboxLinkEvent.OpenReport]: { reportId: string };
}

export interface PendingInboxDeepLink {
  reportId: string;
}

@injectable()
export class InboxLinkService extends TypedEventEmitter<InboxLinkEvents> {
  private pendingDeepLink: PendingInboxDeepLink | null = null;

  constructor(
    @inject(MAIN_TOKENS.DeepLinkService)
    private readonly deepLinkService: DeepLinkService,
    @inject(MAIN_TOKENS.MainWindow)
    private readonly mainWindow: IMainWindow,
  ) {
    super();

    this.deepLinkService.registerHandler("inbox", (path) =>
      this.handleInboxLink(path),
    );
  }

  private handleInboxLink(path: string): boolean {
    // path format: "abc123" from posthog-code://inbox/abc123
    const reportId = path.split("/")[0];

    if (!reportId) {
      log.warn("Inbox link missing report ID");
      return false;
    }

    const hasListeners = this.listenerCount(InboxLinkEvent.OpenReport) > 0;

    if (hasListeners) {
      log.info(`Emitting inbox link event: reportId=${reportId}`);
      this.emit(InboxLinkEvent.OpenReport, { reportId });
    } else {
      log.info(
        `Queueing inbox link (renderer not ready): reportId=${reportId}`,
      );
      this.pendingDeepLink = { reportId };
    }

    log.info("Deep link focusing window", { reportId });
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }
    this.mainWindow.focus();

    return true;
  }

  public consumePendingDeepLink(): PendingInboxDeepLink | null {
    const pending = this.pendingDeepLink;
    this.pendingDeepLink = null;
    if (pending) {
      log.info(`Consumed pending inbox link: reportId=${pending.reportId}`);
    }
    return pending;
  }
}
