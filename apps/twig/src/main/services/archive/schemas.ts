import { z } from "zod";

export const archiveTaskInput = z.object({
  taskId: z.string(),
  title: z.string(),
  repository: z.string().nullable(),
});

export type ArchiveTaskInput = z.infer<typeof archiveTaskInput>;

export const unarchiveTaskInput = z.object({
  taskId: z.string(),
  recreateBranch: z.boolean().optional(),
});

export type UnarchiveTaskInput = z.infer<typeof unarchiveTaskInput>;

export const archivedTaskSchema = z.object({
  taskId: z.string(),
  title: z.string(),
  archivedAt: z.string(),
  repository: z.string().nullable(),
  folderId: z.string(),
  mode: z.enum(["worktree", "local", "cloud"]),
  worktreeName: z.string().nullable(),
  branchName: z.string().nullable(),
  checkpointId: z.string().nullable(),
});

export const archiveTaskOutput = archivedTaskSchema;

export const unarchiveTaskOutput = z.object({
  taskId: z.string(),
  worktreeName: z.string().nullable(),
});

export const listArchivedTasksOutput = z.array(archivedTaskSchema);

export const archivedTaskIdsOutput = z.array(z.string());
