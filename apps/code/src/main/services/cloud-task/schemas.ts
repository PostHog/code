import {
  type CloudTaskUpdatePayload,
  isTerminalStatus,
  type TaskRunStatus,
  TERMINAL_STATUSES,
} from "@shared/types";
import { z } from "zod";

export type { CloudTaskUpdatePayload, TaskRunStatus };
export { TERMINAL_STATUSES, isTerminalStatus };

// --- Events ---

export const CloudTaskEvent = {
  Update: "cloud-task-update",
} as const;

export interface CloudTaskEvents {
  [CloudTaskEvent.Update]: CloudTaskUpdatePayload;
}

// --- tRPC Schemas ---

export const watchInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
});

export type WatchInput = z.infer<typeof watchInput>;

export const unwatchInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});

export const retryInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});

export const onUpdateInput = z.object({
  taskId: z.string(),
  runId: z.string(),
});

export const sendCommandInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
  method: z.enum([
    "user_message",
    "cancel",
    "close",
    "permission_response",
    "set_config_option",
  ]),
  params: z.record(z.string(), z.unknown()).optional(),
});

export type SendCommandInput = z.infer<typeof sendCommandInput>;

export const sendCommandOutput = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().optional(),
});

export type SendCommandOutput = z.infer<typeof sendCommandOutput>;
