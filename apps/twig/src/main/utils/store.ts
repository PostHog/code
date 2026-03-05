import { app } from "electron";
import Store from "electron-store";
import type {
  RegisteredFolder,
  TaskFolderAssociation,
} from "../../shared/types";
import type { ArchivedTask } from "../../shared/types/archive";

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

interface FoldersSchema {
  folders: RegisteredFolder[];
  taskAssociations: TaskFolderAssociation[];
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

const foldersSchema = {
  folders: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        id: { type: "string" as const },
        path: { type: "string" as const },
        name: { type: "string" as const },
        lastAccessed: { type: "string" as const },
        createdAt: { type: "string" as const },
      },
      required: ["id", "path", "name", "lastAccessed", "createdAt"],
    },
  },
  taskAssociations: {
    type: "array" as const,
    default: [],
    items: {
      type: "object" as const,
      properties: {
        taskId: { type: "string" as const },
        folderId: { type: "string" as const },
        mode: { type: "string" as const },
        worktree: {},
        branchName: { type: ["string", "null"] as const },
      },
      required: ["taskId", "folderId", "mode"],
    },
  },
};

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

export const foldersStore = new Store<FoldersSchema>({
  name: "folders",
  schema: foldersSchema,
  cwd: app.getPath("userData"),
  defaults: {
    folders: [],
    taskAssociations: [],
  },
});

interface ArchiveStoreSchema {
  archivedTasks: ArchivedTask[];
}

export const archiveStore = new Store<ArchiveStoreSchema>({
  name: "archive",
  cwd: app.getPath("userData"),
  defaults: { archivedTasks: [] },
});

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
