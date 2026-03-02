import type { WorkspaceMode } from "../types";

export interface ArchivedTask {
  taskId: string;
  archivedAt: string;
  folderId: string;
  mode: WorkspaceMode;
  worktreeName: string | null;
  branchName: string | null;
  checkpointId: string | null;
}
