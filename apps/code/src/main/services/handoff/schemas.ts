import { z } from "zod";

export const handoffPreflightInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  repoPath: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
});

export type HandoffPreflightInput = z.infer<typeof handoffPreflightInput>;

export const handoffPreflightResult = z.object({
  canHandoff: z.boolean(),
  reason: z.string().optional(),
  localTreeDirty: z.boolean(),
});

export type HandoffPreflightResult = z.infer<typeof handoffPreflightResult>;

export const handoffExecuteInput = z.object({
  taskId: z.string(),
  runId: z.string(),
  repoPath: z.string(),
  apiHost: z.string(),
  teamId: z.number(),
  sessionId: z.string().optional(),
  adapter: z.enum(["claude", "codex"]).optional(),
});

export type HandoffExecuteInput = z.infer<typeof handoffExecuteInput>;

export const handoffExecuteResult = z.object({
  success: z.boolean(),
  sessionId: z.string().optional(),
  error: z.string().optional(),
});

export type HandoffExecuteResult = z.infer<typeof handoffExecuteResult>;

export type HandoffStep =
  | "fetching_logs"
  | "applying_snapshot"
  | "updating_run"
  | "spawning_agent"
  | "complete"
  | "failed";

export interface HandoffProgressPayload {
  taskId: string;
  step: HandoffStep;
  message: string;
}

export const HandoffEvent = {
  Progress: "handoff-progress",
} as const;

export interface HandoffServiceEvents {
  [HandoffEvent.Progress]: HandoffProgressPayload;
}
