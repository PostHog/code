import path from "node:path";
import { fileURLToPath } from "node:url";
import { createIPCHandler } from "@posthog/electron-trpc/main";
import { BrowserWindow, screen, shell } from "electron";
import { buildApplicationMenu } from "./menu.js";
import { setMainWindowGetter } from "./trpc/context.js";
import { trpcRouter } from "./trpc/router.js";
import { isDevBuild } from "./utils/env.js";
import { type WindowStateSchema, windowStateStore } from "./utils/store.js";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isPositionOnScreen(x: number, y: number): boolean {
  const displays = screen.getAllDisplays();
  return displays.some((display) => {
    const { x: dx, y: dy, width, height } = display.bounds;
    return x >= dx && x < dx + width && y >= dy && y < dy + height;
  });
}

function getSavedWindowState(): WindowStateSchema {
  const state = {
    x: windowStateStore.get("x"),
    y: windowStateStore.get("y"),
    width: windowStateStore.get("width", 1200),
    height: windowStateStore.get("height", 600),
    isMaximized: windowStateStore.get("isMaximized", true),
  };

  // Validate position is still on a connected display
  if (state.x !== undefined && state.y !== undefined) {
    if (!isPositionOnScreen(state.x, state.y)) {
      state.x = undefined;
      state.y = undefined;
    }
  }

  return state;
}

function saveWindowState(window: BrowserWindow): void {
  const isMaximized = window.isMaximized();
  windowStateStore.set("isMaximized", isMaximized);

  // Only save bounds when not maximized, so restoring from maximized
  // gives the user their previous windowed size/position
  if (!isMaximized) {
    const bounds = window.getBounds();
    windowStateStore.set("x", bounds.x);
    windowStateStore.set("y", bounds.y);
    windowStateStore.set("width", bounds.width);
    windowStateStore.set("height", bounds.height);
  }
}

let mainWindow: BrowserWindow | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export function focusMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

function setupExternalLinkHandlers(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    const appUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL || "file://";
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });
}

export function createWindow(): void {
  const isDev = isDevBuild();
  const savedState = getSavedWindowState();
  let saveTimeout: ReturnType<typeof setTimeout> | null = null;

  const scheduleSaveWindowState = (window: BrowserWindow): void => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }

    saveTimeout = setTimeout(() => {
      if (!window.isDestroyed()) {
        saveWindowState(window);
      }
      saveTimeout = null;
    }, 200);
  };

  mainWindow = new BrowserWindow({
    ...(savedState.x !== undefined && { x: savedState.x }),
    ...(savedState.y !== undefined && { y: savedState.y }),
    width: savedState.width,
    height: savedState.height,
    minWidth: 1200,
    minHeight: 600,
    backgroundColor: "#0a0a0a",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 9 },
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
      enableBlinkFeatures: "GetDisplayMedia",
      partition: "persist:main",
      ...(isDev && { webSecurity: false }),
    },
  });

  mainWindow.once("ready-to-show", () => {
    if (savedState.isMaximized) {
      mainWindow?.maximize();
    }
    mainWindow?.show();
  });

  // Persist window state on changes
  mainWindow.on(
    "resize",
    () => mainWindow && scheduleSaveWindowState(mainWindow),
  );
  mainWindow.on(
    "move",
    () => mainWindow && scheduleSaveWindowState(mainWindow),
  );
  mainWindow.on("maximize", () => mainWindow && saveWindowState(mainWindow));
  mainWindow.on("unmaximize", () => mainWindow && saveWindowState(mainWindow));
  mainWindow.on("close", () => mainWindow && saveWindowState(mainWindow));

  setMainWindowGetter(() => mainWindow);

  createIPCHandler({
    router: trpcRouter,
    windows: [mainWindow],
  });

  setupExternalLinkHandlers(mainWindow);
  buildApplicationMenu();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  mainWindow.on("closed", () => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    mainWindow = null;
  });
}
