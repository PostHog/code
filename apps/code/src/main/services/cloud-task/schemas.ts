import type { CloudTaskUpdatePayload, TaskRun } from "@shared/types.js";
import { z } from "zod";

export type { CloudTaskUpdatePayload };

// --- Terminal statuses ---

export const TERMINAL_STATUSES = ["completed", "failed", "cancelled"] as const;

// --- Events ---

export const CloudTaskEvent = {
  Update: "cloud-task-update",
} as const;

export interface CloudTaskEvents {
  [CloudTaskEvent.Update]: CloudTaskUpdatePayload;
}

export type TaskRunStatus = TaskRun["status"];

// --- tRPC Schemas ---

export const watchInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
  viewing: z.boolean().optional(),
});

export type WatchInput = z.infer<typeof watchInput>;

export const unwatchInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});

export const updateTokenInput = z.object({
  token: z.string(),
});

export const onUpdateInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});

export const setViewingInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  viewing: z.boolean(),
});

export const sendCommandInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
  method: z.enum(["user_message", "cancel", "close"]),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type SendCommandInput = z.infer<typeof sendCommandInput>;

export const sendCommandOutput = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type SendCommandOutput = z.infer<typeof sendCommandOutput>;
