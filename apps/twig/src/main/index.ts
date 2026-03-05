import "reflect-metadata";
import os from "node:os";
import { app, powerMonitor } from "electron";
import log from "electron-log/main";
import "./utils/logger";
import "./services/index.js";
import { ANALYTICS_EVENTS } from "@shared/types/analytics.js";
import type { DatabaseService } from "./db/service.js";
import { initializeDeepLinks, registerDeepLinkHandlers } from "./deep-links.js";
import { container } from "./di/container.js";
import { MAIN_TOKENS } from "./di/tokens.js";
import type { AppLifecycleService } from "./services/app-lifecycle/service.js";
import type { ExternalAppsService } from "./services/external-apps/service.js";
import type { NotificationService } from "./services/notification/service.js";
import type { OAuthService } from "./services/oauth/service.js";
import {
  captureException,
  initializePostHog,
  trackAppEvent,
} from "./services/posthog-analytics.js";
import type { PosthogPluginService } from "./services/posthog-plugin/service.js";
import type { TaskLinkService } from "./services/task-link/service";
import type { UpdatesService } from "./services/updates/service.js";
import type { WorkspaceService } from "./services/workspace/service.js";
import { ensureClaudeConfigDir } from "./utils/env.js";
import { migrateTaskAssociations } from "./utils/store.js";
import { createWindow } from "./window.js";

// Single instance lock must be acquired FIRST before any other app setup
const additionalData = process.defaultApp ? { argv: process.argv } : undefined;
const gotTheLock = app.requestSingleInstanceLock(additionalData);
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

function initializeServices(): void {
  container.get<DatabaseService>(MAIN_TOKENS.DatabaseService);
  container.get<OAuthService>(MAIN_TOKENS.OAuthService);
  container.get<NotificationService>(MAIN_TOKENS.NotificationService);
  container.get<UpdatesService>(MAIN_TOKENS.UpdatesService);
  container.get<TaskLinkService>(MAIN_TOKENS.TaskLinkService);
  container.get<ExternalAppsService>(MAIN_TOKENS.ExternalAppsService);
  container.get<PosthogPluginService>(MAIN_TOKENS.PosthogPluginService);

  // Initialize workspace branch watcher for live branch rename detection
  const workspaceService = container.get<WorkspaceService>(
    MAIN_TOKENS.WorkspaceService,
  );
  workspaceService.initBranchWatcher();

  // Track app started event
  trackAppEvent(ANALYTICS_EVENTS.APP_STARTED);
}

// ========================================================
// App lifecycle
// ========================================================

// Register deep link handlers
registerDeepLinkHandlers();

// Initialize PostHog analytics
initializePostHog();

app.whenReady().then(() => {
  const commit = __BUILD_COMMIT__ ?? "dev";
  const buildDate = __BUILD_DATE__ ?? "dev";
  log.info(
    [
      `Twig electron v${app.getVersion()} booting up`,
      `Commit: ${commit}`,
      `Date: ${buildDate}`,
      `Electron: ${process.versions.electron}`,
      `Chromium: ${process.versions.chrome}`,
      `Node.js: ${process.versions.node}`,
      `V8: ${process.versions.v8}`,
      `OS: ${process.platform} ${process.arch} ${os.release()}`,
    ].join(" | "),
  );
  migrateTaskAssociations();
  ensureClaudeConfigDir();
  createWindow();
  initializeServices();
  initializeDeepLinks();
  powerMonitor.on("suspend", () => {
    log.info("System entering sleep");
  });

  powerMonitor.on("resume", () => {
    log.info("System waking from sleep");
  });
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", async (event) => {
  let lifecycleService: AppLifecycleService;
  try {
    lifecycleService = container.get<AppLifecycleService>(
      MAIN_TOKENS.AppLifecycleService,
    );
  } catch {
    // Container already torn down (e.g. second quit during shutdown), let Electron quit
    return;
  }

  // If quitting to install an update, don't block and let the updater handle it
  // we already gracefully shutdown the app in the updates service when the update is ready
  if (lifecycleService.isQuittingForUpdate) {
    return;
  }

  // If shutdown is already in progress, force-kill immediately
  if (lifecycleService.isShuttingDown) {
    lifecycleService.forceKill();
  }

  event.preventDefault();

  // If an update is downloaded, install it instead of doing a normal shutdown.
  // installUpdate() handles its own lightweight cleanup and quitAndInstall.
  try {
    const updatesService = container.get<UpdatesService>(
      MAIN_TOKENS.UpdatesService,
    );
    if (updatesService.hasUpdateReady) {
      log.info("Update ready, installing on quit");
      const { installed } = await updatesService.installUpdate();
      if (installed) return;
    }
  } catch {
    // Updates service not available, fall through to normal shutdown
  }

  await lifecycleService.gracefulExit();
});

const handleShutdownSignal = async (signal: string) => {
  log.info(`Received ${signal}, starting shutdown`);
  try {
    const lifecycleService = container.get<AppLifecycleService>(
      MAIN_TOKENS.AppLifecycleService,
    );
    if (lifecycleService.isShuttingDown) {
      log.warn(`${signal} received during shutdown, forcing exit`);
      process.exit(1);
    }
    await lifecycleService.shutdown();
  } catch (_err) {
    // Container torn down or shutdown failed
  }
  process.exit(0);
};

// ========================================================
// Process signal handlers
// ========================================================

process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
process.on("SIGHUP", () => handleShutdownSignal("SIGHUP"));

process.on("uncaughtException", (error) => {
  if (error.message === "write EIO") {
    log.transports.console.level = false;
    return;
  }
  log.error("Uncaught exception", error);
  captureException(error, { source: "main", type: "uncaughtException" });
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled rejection", reason);
  const error = reason instanceof Error ? reason : new Error(String(reason));
  captureException(error, { source: "main", type: "unhandledRejection" });
});
