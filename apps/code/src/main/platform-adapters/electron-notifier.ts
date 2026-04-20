import type { INotifier, NotifyOptions } from "@posthog/platform/notifier";
import { app, Notification } from "electron";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../di/tokens";
import type { ElectronMainWindow } from "./electron-main-window";

@injectable()
export class ElectronNotifier implements INotifier {
  constructor(
    @inject(MAIN_TOKENS.MainWindow)
    private readonly mainWindow: ElectronMainWindow,
  ) {}

  public isSupported(): boolean {
    return Notification.isSupported();
  }

  public notify(options: NotifyOptions): void {
    const notification = new Notification({
      title: options.title,
      body: options.body,
      silent: options.silent,
    });
    if (options.onClick) {
      notification.on("click", options.onClick);
    }
    notification.show();
  }

  public setUnreadIndicator(on: boolean): void {
    if (on) {
      app.dock?.setBadge("•");
      this.mainWindow.getBrowserWindow()?.flashFrame(true);
    } else {
      app.dock?.setBadge("");
      this.mainWindow.getBrowserWindow()?.flashFrame(false);
    }
  }

  public requestAttention(): void {
    app.dock?.bounce("informational");
    this.mainWindow.getBrowserWindow()?.flashFrame(true);
  }
}
