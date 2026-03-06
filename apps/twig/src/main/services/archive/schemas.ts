import { z } from "zod";
import {
  type ArchivedTask,
  archivedTaskSchema,
} from "../../../shared/types/archive.js";

export { archivedTaskSchema, type ArchivedTask };

export const archiveTaskInput = z.object({
  taskId: z.string(),
});

export type ArchiveTaskInput = z.infer<typeof archiveTaskInput>;

export const unarchiveTaskInput = z.object({
  taskId: z.string(),
  recreateBranch: z.boolean().optional(),
});

export type UnarchiveTaskInput = z.infer<typeof unarchiveTaskInput>;

export const archiveTaskOutput = archivedTaskSchema;

export const unarchiveTaskOutput = z.object({
  taskId: z.string(),
  worktreeName: z.string().nullable(),
});

export const listArchivedTasksOutput = z.array(archivedTaskSchema);

export const archivedTaskIdsOutput = z.array(z.string());

export const deleteArchivedTaskInput = z.object({
  taskId: z.string(),
});

export const deleteArchivedTaskOutput = z.void();
