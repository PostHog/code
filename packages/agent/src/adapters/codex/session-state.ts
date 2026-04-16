/**
 * Session state tracking for Codex proxy agent.
 * Tracks usage accumulation, model/mode state, and config options.
 */

import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import type { CodeExecutionMode } from "../../execution-mode";

export interface CodexUsage {
  inputTokens: number;
  outputTokens: number;
  cachedReadTokens: number;
  cachedWriteTokens: number;
}

export interface CodexSessionState {
  sessionId: string;
  cwd: string;
  modelId?: string;
  modeId: string;
  configOptions: SessionConfigOption[];
  accumulatedUsage: CodexUsage;
  contextSize?: number;
  contextUsed?: number;
  permissionMode: CodeExecutionMode;
  taskRunId?: string;
  taskId?: string;
}

export function createSessionState(
  sessionId: string,
  cwd: string,
  opts?: {
    taskRunId?: string;
    taskId?: string;
    modeId?: string;
    modelId?: string;
    permissionMode?: CodeExecutionMode;
  },
): CodexSessionState {
  return {
    sessionId,
    cwd,
    modeId: opts?.modeId ?? "default",
    modelId: opts?.modelId,
    configOptions: [],
    accumulatedUsage: {
      inputTokens: 0,
      outputTokens: 0,
      cachedReadTokens: 0,
      cachedWriteTokens: 0,
    },
    permissionMode: opts?.permissionMode ?? "default",
    taskRunId: opts?.taskRunId,
    taskId: opts?.taskId,
  };
}

export function resetUsage(state: CodexSessionState): void {
  state.accumulatedUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cachedReadTokens: 0,
    cachedWriteTokens: 0,
  };
}
