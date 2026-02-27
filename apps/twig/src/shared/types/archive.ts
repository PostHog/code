import type { WorkspaceMode } from "../types";

export interface ArchivedTask {
  taskId: string;
  title: string;
  archivedAt: string;
  repository: string | null;
  folderId: string;
  mode: WorkspaceMode;
  worktreeName: string | null;
  branchName: string | null;
  checkpointId: string | null;
}
