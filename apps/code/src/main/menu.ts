import os from "node:os";
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  type MenuItemConstructorOptions,
  shell,
} from "electron";
import { container } from "./di/container";
import { MAIN_TOKENS } from "./di/tokens";
import type { UIService } from "./services/ui/service";
import type { UpdatesService } from "./services/updates/service";
import { isDevBuild } from "./utils/env";
import { getLogFilePath } from "./utils/logger";

function getSystemInfo(): string {
  const commit = __BUILD_COMMIT__ ?? "dev";
  const buildDate = __BUILD_DATE__ ?? "dev";
  return [
    `Version: ${app.getVersion()}`,
    `Commit: ${commit}`,
    `Date: ${buildDate}`,
    `Electron: ${process.versions.electron}`,
    `Chromium: ${process.versions.chrome}`,
    `Node.js: ${process.versions.node}`,
    `V8: ${process.versions.v8}`,
    `OS: ${process.platform} ${process.arch} ${os.release()}`,
  ].join("\n");
}

export function buildApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    buildAppMenu(),
    buildFileMenu(),
    buildEditMenu(),
    buildViewMenu(),
    buildWindowMenu(),
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function buildAppMenu(): MenuItemConstructorOptions {
  return {
    label: "PostHog Code",
    submenu: [
      {
        label: "About PostHog Code",
        click: () => {
          const info = getSystemInfo();

          dialog
            .showMessageBox({
              type: "info",
              title: "About PostHog Code",
              message: "PostHog Code",
              detail: info,
              buttons: ["Copy", "OK"],
              defaultId: 1,
            })
            .then((result) => {
              if (result.response === 0) {
                clipboard.writeText(info);
              }
            });
        },
      },
      { type: "separator" },
      ...(!isDevBuild()
        ? [
            {
              label: "Check for Updates...",
              click: () => {
                container
                  .get<UpdatesService>(MAIN_TOKENS.UpdatesService)
                  .triggerMenuCheck();
              },
            },
          ]
        : []),
      { type: "separator" },
      { role: "hide" as const },
      { role: "hideOthers" as const },
      { role: "unhide" as const },
      { type: "separator" as const },
      {
        label: "Settings...",
        accelerator: "CmdOrCtrl+,",
        click: () => {
          container.get<UIService>(MAIN_TOKENS.UIService).openSettings();
        },
      },
      { type: "separator" as const },
      { role: "quit" as const },
    ],
  };
}

function buildFileMenu(): MenuItemConstructorOptions {
  return {
    label: "File",
    submenu: [
      {
        label: "New task",
        accelerator: "CmdOrCtrl+N",
        click: () => {
          container.get<UIService>(MAIN_TOKENS.UIService).newTask();
        },
      },
      { type: "separator" },
      {
        label: "Developer",
        submenu: [
          {
            label:
              process.platform === "darwin"
                ? "Show log file in Finder"
                : "Show log file in file manager",
            click: () => {
              shell.showItemInFolder(getLogFilePath());
            },
          },
          { type: "separator" },
          {
            label: "Invalidate OAuth token",
            click: () => {
              container.get<UIService>(MAIN_TOKENS.UIService).invalidateToken();
            },
          },
          { type: "separator" },
          {
            label: "Clear application storage",
            click: () => {
              container.get<UIService>(MAIN_TOKENS.UIService).clearStorage();
            },
          },
        ],
      },
    ],
  };
}

function buildEditMenu(): MenuItemConstructorOptions {
  return {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };
}

function buildViewMenu(): MenuItemConstructorOptions {
  return {
    label: "View",
    submenu: [
      {
        label: "Reload",
        accelerator: "CmdOrCtrl+Shift+R",
        click: () => BrowserWindow.getFocusedWindow()?.webContents.reload(),
      },
      {
        label: "Force Reload",
        accelerator: "CmdOrCtrl+Shift+Alt+R",
        click: () =>
          BrowserWindow.getFocusedWindow()?.webContents.reloadIgnoringCache(),
      },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
      { type: "separator" },
      {
        label: "Reset layout",
        click: () => {
          container.get<UIService>(MAIN_TOKENS.UIService).resetLayout();
        },
      },
    ],
  };
}

function buildWindowMenu(): MenuItemConstructorOptions {
  return {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { role: "front" },
    ],
  };
}
