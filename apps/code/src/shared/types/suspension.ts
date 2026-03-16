import { z } from "zod";

export const suspensionReasonSchema = z.enum([
  "max_worktrees",
  "inactivity",
  "manual",
]);

export type SuspensionReason = z.infer<typeof suspensionReasonSchema>;

export const suspendedTaskSchema = z.object({
  taskId: z.string(),
  suspendedAt: z.string(),
  reason: suspensionReasonSchema,
  folderId: z.string(),
  mode: z.enum(["worktree", "local", "cloud"]),
  worktreeName: z.string().nullable(),
  branchName: z.string().nullable(),
  checkpointId: z.string().nullable(),
});

export type SuspendedTask = z.infer<typeof suspendedTaskSchema>;

export const suspensionSettingsSchema = z.object({
  autoSuspendEnabled: z.boolean(),
  maxActiveWorktrees: z.number().min(1),
  autoSuspendAfterDays: z.number().min(1),
});

export type SuspensionSettings = z.infer<typeof suspensionSettingsSchema>;
