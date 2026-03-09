import { app } from "electron";
import Store from "electron-store";

interface FocusSession {
  mainRepoPath: string;
  worktreePath: string;
  branch: string;
  originalBranch: string;
  mainStashRef: string | null;
  commitSha: string;
}

interface FocusStoreSchema {
  sessions: Record<string, FocusSession>;
}

interface RendererStoreSchema {
  [key: string]: string;
}

export interface WindowStateSchema {
  x: number | undefined;
  y: number | undefined;
  width: number;
  height: number;
  isMaximized: boolean;
}

export const rendererStore = new Store<RendererStoreSchema>({
  name: "renderer-storage",
  cwd: app.getPath("userData"),
});

export const focusStore = new Store<FocusStoreSchema>({
  name: "focus",
  cwd: app.getPath("userData"),
  defaults: { sessions: {} },
});

export type { FocusSession };

export const windowStateStore = new Store<WindowStateSchema>({
  name: "window-state",
  cwd: app.getPath("userData"),
  defaults: {
    x: undefined,
    y: undefined,
    width: 1200,
    height: 600,
    isMaximized: true,
  },
});
