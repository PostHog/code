import { ANALYTICS_EVENTS } from "@shared/types/analytics.js";
import { app } from "electron";
import { injectable } from "inversify";
import type { DatabaseService } from "../../db/service.js";
import { container } from "../../di/container.js";
import { MAIN_TOKENS } from "../../di/tokens.js";
import { withTimeout } from "../../utils/async.js";
import { logger } from "../../utils/logger.js";
import { shutdownPostHog, trackAppEvent } from "../posthog-analytics.js";
import type { ProcessTrackingService } from "../process-tracking/service.js";
import type { WatcherRegistryService } from "../watcher-registry/service.js";

const log = logger.scope("app-lifecycle");

@injectable()
export class AppLifecycleService {
  private static readonly SHUTDOWN_TIMEOUT_MS = 3000;

  private _isQuittingForUpdate = false;
  private _isShuttingDown = false;

  get isQuittingForUpdate(): boolean {
    return this._isQuittingForUpdate;
  }

  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  setQuittingForUpdate(): void {
    this._isQuittingForUpdate = true;
  }

  /**
   * Immediately kills the process. Used when shutdown is stuck or re-entrant.
   */
  forceKill(): never {
    log.warn("Force-killing process");
    process.exit(1);
  }

  /**
   * Full graceful shutdown with timeout. Force-kills if already in progress or times out.
   */
  async shutdown(): Promise<void> {
    if (this._isShuttingDown) {
      log.warn("Shutdown already in progress, forcing exit");
      this.forceKill();
    }

    this._isShuttingDown = true;

    const result = await withTimeout(
      this.doShutdown(),
      AppLifecycleService.SHUTDOWN_TIMEOUT_MS,
    );

    if (result.result === "timeout") {
      log.warn("Shutdown timeout reached, forcing exit", {
        timeoutMs: AppLifecycleService.SHUTDOWN_TIMEOUT_MS,
      });
      this.forceKill();
    }
  }

  /**
   * Tears down watchers and processes but keeps the DI container alive
   * so the before-quit handler can still access services. Used before quitAndInstall.
   */
  async shutdownWithoutContainer(): Promise<void> {
    log.info("Partial shutdown started (keeping container)");
    await this.teardownNativeResources();
    try {
      const db = container.get<DatabaseService>(MAIN_TOKENS.DatabaseService);
      db.close();
    } catch (error) {
      log.warn("Failed to close database during partial shutdown", error);
    }
  }

  /**
   * Runs a full shutdown then exits the Electron app.
   */
  async gracefulExit(): Promise<void> {
    await this.shutdown();
    app.exit(0);
  }

  /**
   * Runs the full shutdown sequence: native resources, container, analytics.
   */
  private async doShutdown(): Promise<void> {
    log.info("Shutdown started");

    await this.teardownNativeResources();

    try {
      await container.unbindAll();
    } catch (error) {
      log.warn("Failed to unbind container", error);
    }

    trackAppEvent(ANALYTICS_EVENTS.APP_QUIT);

    try {
      await shutdownPostHog();
    } catch (error) {
      log.warn("Failed to shutdown PostHog", error);
    }

    log.info("Shutdown complete");
  }

  /**
   * Shuts down file watchers and kills child processes, then drains the
   * event loop so pending native callbacks fire while JS is still alive.
   */
  private async teardownNativeResources(): Promise<void> {
    try {
      const watcherRegistry = container.get<WatcherRegistryService>(
        MAIN_TOKENS.WatcherRegistryService,
      );
      await watcherRegistry.shutdownAll();
    } catch (error) {
      log.warn("Failed to shutdown watcher registry", error);
    }

    try {
      const processTracking = container.get<ProcessTrackingService>(
        MAIN_TOKENS.ProcessTrackingService,
      );
      const snapshot = await processTracking.getSnapshot(true);
      log.debug("Process snapshot", {
        tracked: {
          shell: snapshot.tracked.shell.length,
          agent: snapshot.tracked.agent.length,
          child: snapshot.tracked.child.length,
        },
        discovered: snapshot.discovered?.length ?? 0,
      });

      const trackedCount =
        snapshot.tracked.shell.length +
        snapshot.tracked.agent.length +
        snapshot.tracked.child.length;

      if (trackedCount > 0) {
        log.info(`Killing ${trackedCount} tracked processes`);
        processTracking.killAll();
      }
    } catch (error) {
      log.warn("Failed to kill tracked processes", error);
    }

    // Drain pending native callbacks (e.g. @parcel/watcher ThreadSafeFunction)
    // so they fire while JS is still alive, not during FreeEnvironment teardown
    await new Promise((resolve) => setImmediate(resolve));
  }
}
