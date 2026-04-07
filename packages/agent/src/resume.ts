/**
 * Resume - Restore agent state from persisted log
 *
 * Handles resuming a task from any point:
 * - Fetches log via the PostHog API
 * - Finds latest tree_snapshot event
 * - Rebuilds conversation from log events
 * - Restores working tree from snapshot
 *
 * Uses Saga pattern for atomic operations with clear success/failure tracking.
 *
 * The log is the single source of truth for:
 * - Conversation history (user_message, agent_message_chunk, tool_call, tool_result)
 * - Working tree state (tree_snapshot events)
 * - Session metadata (device info, mode changes)
 */

import type { ContentBlock } from "@agentclientprotocol/sdk";
import { selectRecentTurns } from "./adapters/claude/session/jsonl-hydration";
import type { PostHogAPIClient } from "./posthog-api";
import { ResumeSaga } from "./sagas/resume-saga";
import type { DeviceInfo, TreeSnapshotEvent } from "./types";
import { Logger } from "./utils/logger";

export interface ResumeState {
  conversation: ConversationTurn[];
  latestSnapshot: TreeSnapshotEvent | null;
  /** Whether the tree snapshot was successfully applied (files restored) */
  snapshotApplied: boolean;
  interrupted: boolean;
  lastDevice?: DeviceInfo;
  logEntryCount: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: ContentBlock[];
  toolCalls?: ToolCallInfo[];
}

export interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input: unknown;
  result?: unknown;
}

export interface ResumeConfig {
  taskId: string;
  runId: string;
  repositoryPath?: string;
  apiClient: PostHogAPIClient;
  logger?: Logger;
}

/**
 * Resume a task from its persisted log.
 * Returns the rebuilt state for the agent to continue from.
 *
 * Uses Saga pattern internally for atomic operations.
 * Note: snapshotApplied field indicates if files were actually restored -
 * even if latestSnapshot is non-null, files may not have been restored if
 * the snapshot had no archive URL or download/extraction failed.
 */
export async function resumeFromLog(
  config: ResumeConfig,
): Promise<ResumeState> {
  const logger =
    config.logger || new Logger({ debug: false, prefix: "[Resume]" });

  logger.info("Resuming from log", {
    taskId: config.taskId,
    runId: config.runId,
  });

  const saga = new ResumeSaga(logger);

  const result = await saga.run({
    taskId: config.taskId,
    runId: config.runId,
    repositoryPath: config.repositoryPath,
    apiClient: config.apiClient,
    logger,
  });

  if (!result.success) {
    logger.error("Failed to resume from log", {
      error: result.error,
      failedStep: result.failedStep,
    });
    throw new Error(
      `Failed to resume at step '${result.failedStep}': ${result.error}`,
    );
  }

  return {
    conversation: result.data.conversation as ConversationTurn[],
    latestSnapshot: result.data.latestSnapshot,
    snapshotApplied: result.data.snapshotApplied,
    interrupted: result.data.interrupted,
    lastDevice: result.data.lastDevice,
    logEntryCount: result.data.logEntryCount,
  };
}

/**
 * Convert resumed conversation back to API format for continuation.
 */
export function conversationToPromptHistory(
  conversation: ConversationTurn[],
): Array<{ role: "user" | "assistant"; content: ContentBlock[] }> {
  return conversation.map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));
}

const RESUME_HISTORY_TOKEN_BUDGET = 50_000;
const TOOL_RESULT_MAX_CHARS = 2000;

export function formatConversationForResume(
  conversation: ConversationTurn[],
): string {
  const selected = selectRecentTurns(conversation, RESUME_HISTORY_TOKEN_BUDGET);
  const parts: string[] = [];

  if (selected.length < conversation.length) {
    parts.push(
      `*(${conversation.length - selected.length} earlier turns omitted)*`,
    );
  }

  for (const turn of selected) {
    const role = turn.role === "user" ? "User" : "Assistant";

    const textParts = turn.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text);

    if (textParts.length > 0) {
      parts.push(`**${role}**: ${textParts.join("\n")}`);
    }

    if (turn.toolCalls?.length) {
      const toolSummary = turn.toolCalls
        .map((tc) => {
          let resultStr = "";
          if (tc.result !== undefined) {
            const raw =
              typeof tc.result === "string"
                ? tc.result
                : JSON.stringify(tc.result);
            resultStr =
              raw.length > TOOL_RESULT_MAX_CHARS
                ? ` → ${raw.substring(0, TOOL_RESULT_MAX_CHARS)}...(truncated)`
                : ` → ${raw}`;
          }
          return `  - ${tc.toolName}${resultStr}`;
        })
        .join("\n");
      parts.push(`**${role} (tools)**:\n${toolSummary}`);
    }
  }

  return parts.join("\n\n");
}
