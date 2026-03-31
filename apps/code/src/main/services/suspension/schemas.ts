import { z } from "zod";
import {
  type SuspendedTask,
  suspendedTaskSchema,
  suspensionReasonSchema,
  suspensionSettingsSchema,
} from "../../../shared/types/suspension.js";

export { suspendedTaskSchema, type SuspendedTask };

export const suspendTaskInput = z.object({
  taskId: z.string(),
  reason: suspensionReasonSchema.optional().default("manual"),
});

export type SuspendTaskInput = z.infer<typeof suspendTaskInput>;

export const restoreTaskInput = z.object({
  taskId: z.string(),
  recreateBranch: z.boolean().optional(),
});

export type RestoreTaskInput = z.infer<typeof restoreTaskInput>;

export const suspendTaskOutput = suspendedTaskSchema;

export const restoreTaskOutput = z.object({
  taskId: z.string(),
  worktreeName: z.string().nullable(),
});

export const listSuspendedTasksOutput = z.array(suspendedTaskSchema);

export const suspendedTaskIdsOutput = z.array(z.string());

export const suspensionSettingsOutput = suspensionSettingsSchema;

export const updateSuspensionSettingsInput = suspensionSettingsSchema.partial();
