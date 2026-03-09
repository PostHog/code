import { z } from "zod";

export const archivedTaskSchema = z.object({
  taskId: z.string(),
  archivedAt: z.string(),
  folderId: z.string(),
  mode: z.enum(["worktree", "local", "cloud"]),
  worktreeName: z.string().nullable(),
  branchName: z.string().nullable(),
  checkpointId: z.string().nullable(),
});

export type ArchivedTask = z.infer<typeof archivedTaskSchema>;
