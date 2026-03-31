import { app } from "electron";
import { container } from "./di/container";
import { MAIN_TOKENS } from "./di/tokens";
import type { DeepLinkService } from "./services/deep-link/service";
import { logger } from "./utils/logger";
import { focusMainWindow } from "./window";

const log = logger.scope("deep-links");

let pendingDeepLinkUrl: string | null = null;

function getDeepLinkService(): DeepLinkService {
  return container.get<DeepLinkService>(MAIN_TOKENS.DeepLinkService);
}

/**
 * Register app-level deep link event handlers.
 * Must be called before app.whenReady() so macOS open-url events are captured.
 */
export function registerDeepLinkHandlers(): void {
  // Handle deep link URLs on macOS
  app.on("open-url", (event, url) => {
    event.preventDefault();
    log.info("open-url event received", { url, appReady: app.isReady() });

    if (!app.isReady()) {
      pendingDeepLinkUrl = url;
      return;
    }

    getDeepLinkService().handleUrl(url);
    focusMainWindow("open-url deep link");
  });

  // Handle deep link URLs on Windows/Linux (second instance sends URL via command line)
  app.on("second-instance", (_event, commandLine) => {
    log.info("second-instance event received", {
      commandLine: commandLine.join(" "),
      argCount: commandLine.length,
    });

    const url = commandLine.find(
      (arg) =>
        arg.startsWith("posthog-code://") ||
        arg.startsWith("twig://") ||
        arg.startsWith("array://"),
    );
    if (url) {
      log.info("Deep link URL found in second-instance args", { url });
      getDeepLinkService().handleUrl(url);
      focusMainWindow("second-instance deep link");
    } else {
      log.warn("second-instance fired with no deep link URL, ignoring focus");
    }
  });
}

/**
 * Register the deep link protocol and process any URLs that arrived before
 * the app was ready.
 * Must be called after app.whenReady().
 */
export function initializeDeepLinks(): void {
  getDeepLinkService().registerProtocol();

  if (process.platform === "darwin") {
    if (pendingDeepLinkUrl) {
      getDeepLinkService().handleUrl(pendingDeepLinkUrl);
      pendingDeepLinkUrl = null;
    }
  } else {
    const deepLinkUrl = process.argv.find(
      (arg) =>
        arg.startsWith("posthog-code://") ||
        arg.startsWith("twig://") ||
        arg.startsWith("array://"),
    );
    if (deepLinkUrl) {
      getDeepLinkService().handleUrl(deepLinkUrl);
    }
  }
}
