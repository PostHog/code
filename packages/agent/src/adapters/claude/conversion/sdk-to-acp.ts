import type {
  AgentSideConnection,
  Role,
  SessionNotification,
  SessionUpdate,
} from "@agentclientprotocol/sdk";
import { RequestError, type StopReason } from "@agentclientprotocol/sdk";
import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKPartialAssistantMessage,
  SDKResultMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";
import type {
  BetaContentBlock,
  BetaRawContentBlockDelta,
} from "@anthropic-ai/sdk/resources/beta.mjs";
import { image, text } from "../../../utils/acp-content.js";
import { unreachable } from "../../../utils/common.js";
import type { Logger } from "../../../utils/logger.js";
import { registerHookCallback } from "../hooks.js";
import type { Session, ToolUpdateMeta, ToolUseCache } from "../types.js";
import {
  type ClaudePlanEntry,
  planEntries,
  toolInfoFromToolUse,
  toolUpdateFromEditToolResponse,
  toolUpdateFromToolResult,
} from "./tool-use-to-acp.js";

type AnthropicContentChunk =
  | ContentBlockParam
  | BetaContentBlock
  | BetaRawContentBlockDelta;

type AnthropicMessageContent = string | Array<{ type: string; text?: string }>;

interface AnthropicMessageWithContent {
  type: Role;
  message: {
    content: AnthropicMessageContent;
    role?: Role;
    model?: string;
  };
}

type ChunkHandlerContext = {
  sessionId: string;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  client: AgentSideConnection;
  logger: Logger;
  parentToolCallId?: string;
  registerHooks?: boolean;
  supportsTerminalOutput?: boolean;
};

export interface MessageHandlerContext {
  session: Session;
  sessionId: string;
  client: AgentSideConnection;
  toolUseCache: ToolUseCache;
  fileContentCache: { [key: string]: string };
  logger: Logger;
  registerHooks?: boolean;
  supportsTerminalOutput?: boolean;
}

function messageUpdateType(role: Role) {
  return role === "assistant" ? "agent_message_chunk" : "user_message_chunk";
}

function toolMeta(
  toolName: string,
  toolResponse?: unknown,
  parentToolCallId?: string,
): ToolUpdateMeta {
  const meta: ToolUpdateMeta["claudeCode"] = { toolName };
  if (toolResponse !== undefined) meta.toolResponse = toolResponse;
  if (parentToolCallId) meta.parentToolCallId = parentToolCallId;
  return { claudeCode: meta };
}

function handleTextChunk(
  chunk: { text: string },
  role: Role,
  parentToolCallId?: string,
): SessionUpdate {
  const update: SessionUpdate = {
    sessionUpdate: messageUpdateType(role),
    content: text(chunk.text),
  };
  if (parentToolCallId) {
    (update as Record<string, unknown>)._meta = toolMeta(
      "__text__",
      undefined,
      parentToolCallId,
    );
  }
  return update;
}

function handleImageChunk(
  chunk: {
    source: { type: string; data?: string; media_type?: string; url?: string };
  },
  role: Role,
): SessionUpdate {
  return {
    sessionUpdate: messageUpdateType(role),
    content: image(
      chunk.source.type === "base64" ? (chunk.source.data ?? "") : "",
      chunk.source.type === "base64" ? (chunk.source.media_type ?? "") : "",
      chunk.source.type === "url" ? chunk.source.url : undefined,
    ),
  };
}

function handleThinkingChunk(
  chunk: { thinking: string },
  parentToolCallId?: string,
): SessionUpdate {
  const update: SessionUpdate = {
    sessionUpdate: "agent_thought_chunk",
    content: text(chunk.thinking),
  };
  if (parentToolCallId) {
    (update as Record<string, unknown>)._meta = toolMeta(
      "__thinking__",
      undefined,
      parentToolCallId,
    );
  }
  return update;
}

function handleToolUseChunk(
  chunk: ToolUseCache[string],
  ctx: ChunkHandlerContext,
): SessionUpdate | null {
  const alreadyCached = chunk.id in ctx.toolUseCache;
  ctx.toolUseCache[chunk.id] = chunk;

  if (chunk.name === "TodoWrite") {
    const input = chunk.input as { todos?: unknown[] };
    if (Array.isArray(input.todos)) {
      return {
        sessionUpdate: "plan",
        entries: planEntries(chunk.input as { todos: ClaudePlanEntry[] }),
      };
    }
    return null;
  }

  if (!alreadyCached && ctx.registerHooks !== false) {
    registerHookCallback(chunk.id, {
      onPostToolUseHook: async (toolUseId, _toolInput, toolResponse) => {
        const toolUse = ctx.toolUseCache[toolUseId];
        if (toolUse) {
          const editUpdate =
            toolUse.name === "Edit"
              ? toolUpdateFromEditToolResponse(toolResponse)
              : null;

          await ctx.client.sessionUpdate({
            sessionId: ctx.sessionId,
            update: {
              _meta: toolMeta(toolUse.name, toolResponse, ctx.parentToolCallId),
              toolCallId: toolUseId,
              sessionUpdate: "tool_call_update",
              ...(editUpdate ? editUpdate : {}),
            },
          });
        } else {
          ctx.logger.error(
            `Got a tool response for tool use that wasn't tracked: ${toolUseId}`,
          );
        }
      },
    });
  }

  let rawInput: Record<string, unknown> | undefined;
  try {
    rawInput = JSON.parse(JSON.stringify(chunk.input));
  } catch {
    // ignore
  }

  const toolInfo = toolInfoFromToolUse(chunk, {
    supportsTerminalOutput: ctx.supportsTerminalOutput,
    toolUseId: chunk.id,
    cachedFileContent: ctx.fileContentCache,
  });

  const meta: Record<string, unknown> = {
    ...toolMeta(chunk.name, undefined, ctx.parentToolCallId),
  };
  if (chunk.name === "Bash" && ctx.supportsTerminalOutput && !alreadyCached) {
    meta.terminal_info = { terminal_id: chunk.id };
  }

  if (alreadyCached) {
    return {
      _meta: meta,
      toolCallId: chunk.id,
      sessionUpdate: "tool_call_update" as const,
      rawInput,
      ...toolInfo,
    };
  }

  return {
    _meta: meta,
    toolCallId: chunk.id,
    sessionUpdate: "tool_call" as const,
    rawInput,
    status: "pending",
    ...toolInfo,
  };
}

function extractTextFromContent(content: unknown): string | null {
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (
        typeof item === "object" &&
        item !== null &&
        "text" in item &&
        typeof (item as Record<string, unknown>).text === "string"
      ) {
        parts.push((item as { text: string }).text);
      }
    }
    return parts.length > 0 ? parts.join("") : null;
  }
  if (typeof content === "string") {
    return content;
  }
  return null;
}

function stripCatLineNumbers(text: string): string {
  return text.replace(/^ *\d+[\t→]/gm, "");
}

function updateFileContentCache(
  toolUse: { name: string; input: unknown },
  chunk: { content?: unknown },
  ctx: ChunkHandlerContext,
): void {
  const input = toolUse.input as Record<string, unknown> | undefined;
  const filePath = input?.file_path ? String(input.file_path) : undefined;
  if (!filePath) return;

  if (toolUse.name === "Read" && !input?.limit && !input?.offset) {
    const fileText = extractTextFromContent(chunk.content);
    if (fileText !== null) {
      ctx.fileContentCache[filePath] = stripCatLineNumbers(fileText);
    }
  } else if (toolUse.name === "Write") {
    const content = input?.content;
    if (typeof content === "string") {
      ctx.fileContentCache[filePath] = content;
    }
  } else if (toolUse.name === "Edit") {
    const oldString = input?.old_string;
    const newString = input?.new_string;
    if (
      typeof oldString === "string" &&
      typeof newString === "string" &&
      filePath in ctx.fileContentCache
    ) {
      const current = ctx.fileContentCache[filePath];
      ctx.fileContentCache[filePath] = input?.replace_all
        ? current.replaceAll(oldString, newString)
        : current.replace(oldString, newString);
    }
  }
}

function handleToolResultChunk(
  chunk: AnthropicContentChunk & {
    tool_use_id: string;
    is_error?: boolean;
    content?: unknown;
  },
  ctx: ChunkHandlerContext,
): SessionUpdate[] {
  const toolUse = ctx.toolUseCache[chunk.tool_use_id];
  if (!toolUse) {
    ctx.logger.error(
      `Got a tool result for tool use that wasn't tracked: ${chunk.tool_use_id}`,
    );
    return [];
  }

  if (toolUse.name === "TodoWrite") {
    return [];
  }

  if (!chunk.is_error) {
    updateFileContentCache(toolUse, chunk, ctx);
  }

  const { _meta: resultMeta, ...toolUpdate } = toolUpdateFromToolResult(
    chunk as Parameters<typeof toolUpdateFromToolResult>[0],
    toolUse,
    {
      supportsTerminalOutput: ctx.supportsTerminalOutput,
      toolUseId: chunk.tool_use_id,
      cachedFileContent: ctx.fileContentCache,
    },
  );

  const updates: SessionUpdate[] = [];

  if (resultMeta?.terminal_output) {
    const terminalOutputMeta: Record<string, unknown> = {
      terminal_output: resultMeta.terminal_output,
    };
    if (ctx.parentToolCallId) {
      terminalOutputMeta.claudeCode = {
        parentToolCallId: ctx.parentToolCallId,
      };
    }
    updates.push({
      _meta: terminalOutputMeta,
      toolCallId: chunk.tool_use_id,
      sessionUpdate: "tool_call_update" as const,
    });
  }

  const meta: Record<string, unknown> = {
    ...toolMeta(toolUse.name, undefined, ctx.parentToolCallId),
    ...(resultMeta?.terminal_exit
      ? { terminal_exit: resultMeta.terminal_exit }
      : {}),
  };

  updates.push({
    _meta: meta,
    toolCallId: chunk.tool_use_id,
    sessionUpdate: "tool_call_update",
    status: chunk.is_error ? "failed" : "completed",
    rawOutput: chunk.content,
    ...toolUpdate,
  });

  return updates;
}

function processContentChunk(
  chunk: AnthropicContentChunk,
  role: Role,
  ctx: ChunkHandlerContext,
): SessionUpdate[] {
  switch (chunk.type) {
    case "text":
    case "text_delta": {
      const update = handleTextChunk(chunk, role, ctx.parentToolCallId);
      return update ? [update] : [];
    }

    case "image": {
      const update = handleImageChunk(chunk, role);
      return update ? [update] : [];
    }

    case "thinking":
    case "thinking_delta": {
      const update = handleThinkingChunk(chunk, ctx.parentToolCallId);
      return update ? [update] : [];
    }

    case "tool_use":
    case "server_tool_use":
    case "mcp_tool_use": {
      const update = handleToolUseChunk(chunk as ToolUseCache[string], ctx);
      return update ? [update] : [];
    }

    case "tool_result":
    case "tool_search_tool_result":
    case "web_fetch_tool_result":
    case "web_search_tool_result":
    case "code_execution_tool_result":
    case "bash_code_execution_tool_result":
    case "text_editor_code_execution_tool_result":
    case "mcp_tool_result":
      return handleToolResultChunk(
        chunk as AnthropicContentChunk & {
          tool_use_id: string;
          is_error?: boolean;
          content?: unknown;
        },
        ctx,
      );

    case "document":
    case "search_result":
    case "redacted_thinking":
    case "input_json_delta":
    case "citations_delta":
    case "signature_delta":
    case "container_upload":
    case "compaction":
    case "compaction_delta":
      return [];

    default:
      unreachable(chunk as never, ctx.logger);
      return [];
  }
}

function toAcpNotifications(
  content:
    | string
    | ContentBlockParam[]
    | BetaContentBlock[]
    | BetaRawContentBlockDelta[],
  role: Role,
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
  parentToolCallId?: string,
  registerHooks?: boolean,
  supportsTerminalOutput?: boolean,
): SessionNotification[] {
  if (typeof content === "string") {
    const update: SessionUpdate = {
      sessionUpdate: messageUpdateType(role),
      content: text(content),
    };
    if (parentToolCallId) {
      (update as Record<string, unknown>)._meta = toolMeta(
        "__text__",
        undefined,
        parentToolCallId,
      );
    }
    return [{ sessionId, update }];
  }

  const ctx: ChunkHandlerContext = {
    sessionId,
    toolUseCache,
    fileContentCache,
    client,
    logger,
    parentToolCallId,
    registerHooks,
    supportsTerminalOutput,
  };
  const output: SessionNotification[] = [];

  for (const chunk of content) {
    for (const update of processContentChunk(chunk, role, ctx)) {
      output.push({ sessionId, update });
    }
  }

  return output;
}

function streamEventToAcpNotifications(
  message: SDKPartialAssistantMessage,
  sessionId: string,
  toolUseCache: ToolUseCache,
  fileContentCache: { [key: string]: string },
  client: AgentSideConnection,
  logger: Logger,
  parentToolCallId?: string,
  registerHooks?: boolean,
  supportsTerminalOutput?: boolean,
): SessionNotification[] {
  const event = message.event;
  switch (event.type) {
    case "content_block_start":
      return toAcpNotifications(
        [event.content_block],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
        parentToolCallId,
        registerHooks,
        supportsTerminalOutput,
      );
    case "content_block_delta":
      return toAcpNotifications(
        [event.delta],
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
        parentToolCallId,
        registerHooks,
        supportsTerminalOutput,
      );
    case "message_start":
    case "message_delta":
    case "message_stop":
    case "content_block_stop":
      return [];

    default:
      unreachable(event as never, logger);
      return [];
  }
}

export async function handleSystemMessage(
  message: Extract<SDKMessage, { type: "system" }>,
  context: MessageHandlerContext,
): Promise<void> {
  const { sessionId, client, logger } = context;

  switch (message.subtype) {
    case "init":
      break;
    case "compact_boundary":
      await client.extNotification("_posthog/compact_boundary", {
        sessionId,
        trigger: message.compact_metadata.trigger,
        preTokens: message.compact_metadata.pre_tokens,
      });
      break;
    case "hook_response":
      logger.info("Hook response received", {
        hookName: message.hook_name,
        hookEvent: message.hook_event,
      });
      break;
    case "status":
      if (message.status === "compacting") {
        logger.info("Session compacting started", { sessionId });
        await client.extNotification("_posthog/status", {
          sessionId,
          status: "compacting",
        });
      }
      break;
    case "task_notification": {
      logger.info("Task notification received", {
        sessionId,
        taskId: message.task_id,
        status: message.status,
        summary: message.summary,
      });
      await client.extNotification("_posthog/task_notification", {
        sessionId,
        taskId: message.task_id,
        status: message.status,
        summary: message.summary,
        outputFile: message.output_file,
      });
      break;
    }
    default:
      break;
  }
}

export type ResultMessageHandlerResult = {
  shouldStop: boolean;
  stopReason?: StopReason;
  error?: Error;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cachedReadTokens: number;
    cachedWriteTokens: number;
    costUsd?: number;
    contextWindowSize?: number;
  };
};

export function handleResultMessage(
  message: SDKResultMessage,
): ResultMessageHandlerResult {
  const usage = extractUsageFromResult(message);

  switch (message.subtype) {
    case "success": {
      if (message.result.includes("Please run /login")) {
        return {
          shouldStop: true,
          error: RequestError.authRequired(),
          usage,
        };
      }
      if ((message as Record<string, unknown>).stop_reason === "max_tokens") {
        return { shouldStop: true, stopReason: "max_tokens", usage };
      }
      if (message.is_error) {
        return {
          shouldStop: true,
          error: RequestError.internalError(undefined, message.result),
          usage,
        };
      }
      return { shouldStop: true, stopReason: "end_turn", usage };
    }
    case "error_during_execution":
      if ((message as Record<string, unknown>).stop_reason === "max_tokens") {
        return { shouldStop: true, stopReason: "max_tokens", usage };
      }
      if (message.is_error) {
        return {
          shouldStop: true,
          error: RequestError.internalError(
            undefined,
            message.errors.join(", ") || message.subtype,
          ),
          usage,
        };
      }
      return { shouldStop: true, stopReason: "end_turn", usage };
    case "error_max_budget_usd":
    case "error_max_turns":
    case "error_max_structured_output_retries":
      if (message.is_error) {
        return {
          shouldStop: true,
          error: RequestError.internalError(
            undefined,
            message.errors.join(", ") || message.subtype,
          ),
          usage,
        };
      }
      return { shouldStop: true, stopReason: "max_turn_requests", usage };
    default:
      return { shouldStop: false, usage };
  }
}

function extractUsageFromResult(
  message: SDKResultMessage,
): ResultMessageHandlerResult["usage"] {
  const msg = message as Record<string, unknown>;
  const msgUsage = msg.usage as Record<string, number> | undefined;
  if (!msgUsage) return undefined;

  const modelUsage = msg.modelUsage as
    | Record<string, { contextWindow: number }>
    | undefined;
  let contextWindowSize: number | undefined;
  if (modelUsage) {
    const contextWindows = Object.values(modelUsage).map(
      (m) => m.contextWindow,
    );
    if (contextWindows.length > 0) {
      contextWindowSize = Math.min(...contextWindows);
    }
  }

  return {
    inputTokens: msgUsage.input_tokens ?? 0,
    outputTokens: msgUsage.output_tokens ?? 0,
    cachedReadTokens: msgUsage.cache_read_input_tokens ?? 0,
    cachedWriteTokens: msgUsage.cache_creation_input_tokens ?? 0,
    costUsd:
      typeof msg.total_cost_usd === "number" ? msg.total_cost_usd : undefined,
    contextWindowSize,
  };
}

export async function handleStreamEvent(
  message: SDKPartialAssistantMessage,
  context: MessageHandlerContext,
): Promise<void> {
  const { sessionId, client, toolUseCache, fileContentCache, logger } = context;
  const parentToolCallId = message.parent_tool_use_id ?? undefined;

  for (const notification of streamEventToAcpNotifications(
    message,
    sessionId,
    toolUseCache,
    fileContentCache,
    client,
    logger,
    parentToolCallId,
    context.registerHooks,
    context.supportsTerminalOutput,
  )) {
    await client.sessionUpdate(notification);
    context.session.notificationHistory.push(notification);
  }
}

function hasLocalCommandStdout(content: AnthropicMessageContent): boolean {
  return (
    typeof content === "string" && content.includes("<local-command-stdout>")
  );
}

function hasLocalCommandStderr(content: AnthropicMessageContent): boolean {
  return (
    typeof content === "string" && content.includes("<local-command-stderr>")
  );
}

function isLoginRequiredMessage(message: AnthropicMessageWithContent): boolean {
  return (
    message.type === "assistant" &&
    message.message.model === "<synthetic>" &&
    Array.isArray(message.message.content) &&
    message.message.content.length === 1 &&
    message.message.content[0].type === "text" &&
    message.message.content[0].text?.includes("Please run /login") === true
  );
}

function isPlainTextUserMessage(message: AnthropicMessageWithContent): boolean {
  const content = message.message.content;
  return (
    message.type === "user" &&
    (typeof content === "string" ||
      (Array.isArray(content) &&
        content.length === 1 &&
        content[0].type === "text"))
  );
}

function shouldSkipUserAssistantMessage(
  message: AnthropicMessageWithContent,
): boolean {
  return (
    hasLocalCommandStdout(message.message.content) ||
    hasLocalCommandStderr(message.message.content) ||
    isLoginRequiredMessage(message)
  );
}

function logSpecialMessages(
  message: AnthropicMessageWithContent,
  logger: Logger,
): void {
  const content = message.message.content;
  if (hasLocalCommandStdout(content) && typeof content === "string") {
    logger.info(content);
  }
  if (hasLocalCommandStderr(content) && typeof content === "string") {
    logger.error(content);
  }
}

function filterMessageContent(
  content: AnthropicMessageContent,
): AnthropicMessageContent {
  if (!Array.isArray(content)) {
    return content;
  }
  return content.filter(
    (block) => block.type !== "text" && block.type !== "thinking",
  );
}

export async function handleUserAssistantMessage(
  message: SDKUserMessage | SDKAssistantMessage,
  context: MessageHandlerContext,
): Promise<{ shouldStop?: boolean; error?: Error }> {
  const { session, sessionId, client, toolUseCache, fileContentCache, logger } =
    context;

  if (shouldSkipUserAssistantMessage(message)) {
    const content = message.message.content;

    // Handle /context by sending its reply as a regular agent message
    if (
      typeof content === "string" &&
      hasLocalCommandStdout(content) &&
      content.includes("Context Usage")
    ) {
      const stripped = content
        .replace("<local-command-stdout>", "")
        .replace("</local-command-stdout>", "");
      for (const notification of toAcpNotifications(
        stripped,
        "assistant",
        sessionId,
        toolUseCache,
        fileContentCache,
        client,
        logger,
      )) {
        await client.sessionUpdate(notification);
      }
    }

    logSpecialMessages(message, logger);

    if (isLoginRequiredMessage(message)) {
      return { shouldStop: true, error: RequestError.authRequired() };
    }
    return {};
  }

  // Skip plain text user messages (already displayed by the ACP client)
  if (isPlainTextUserMessage(message)) {
    return {};
  }

  const content = message.message.content;
  const contentToProcess =
    message.type === "assistant" ? filterMessageContent(content) : content;
  const parentToolCallId =
    "parent_tool_use_id" in message
      ? (message.parent_tool_use_id ?? undefined)
      : undefined;

  for (const notification of toAcpNotifications(
    contentToProcess as typeof content,
    message.message.role,
    sessionId,
    toolUseCache,
    fileContentCache,
    client,
    logger,
    parentToolCallId,
    context.registerHooks,
    context.supportsTerminalOutput,
  )) {
    await client.sessionUpdate(notification);
    session.notificationHistory.push(notification);
  }

  return {};
}
