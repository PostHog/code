import type {
  ContentBlock,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import type { QueuedMessage } from "@features/sessions/stores/sessionStore";
import type { SessionUpdate, ToolCall } from "@features/sessions/types";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  type UserShellExecuteParams,
} from "@shared/types/session-events";
import { extractPromptDisplayContent } from "@utils/promptContent";
import { type GitActionType, parseGitActionMessage } from "./GitActionMessage";
import type { RenderItem } from "./session-update/SessionUpdateView";
import type { UserMessageAttachment } from "./session-update/UserMessage";
import type { UserShellExecute } from "./session-update/UserShellExecuteView";

export interface TurnContext {
  toolCalls: Map<string, ToolCall>;
  childItems: Map<string, ConversationItem[]>;
  turnCancelled: boolean;
  turnComplete: boolean;
}

export type ConversationItem =
  | {
      type: "user_message";
      id: string;
      content: string;
      timestamp: number;
      attachments?: UserMessageAttachment[];
    }
  | { type: "git_action"; id: string; actionType: GitActionType }
  | {
      type: "session_update";
      id: string;
      update: RenderItem;
      turnContext: TurnContext;
      thoughtComplete?: boolean;
    }
  | {
      type: "git_action_result";
      id: string;
      actionType: GitActionType;
      turnId: string;
    }
  | { type: "turn_cancelled"; id: string; interruptReason?: string }
  | UserShellExecute
  | { type: "queued"; id: string; message: QueuedMessage };

export interface LastTurnInfo {
  isComplete: boolean;
  durationMs: number;
  stopReason?: string;
}

export interface BuildResult {
  items: ConversationItem[];
  lastTurnInfo: LastTurnInfo | null;
  isCompacting: boolean;
}

interface TurnState {
  id: string;
  promptId: number;
  isComplete: boolean;
  stopReason?: string;
  interruptReason?: string;
  durationMs: number;
  toolCalls: Map<string, ToolCall>;
  context: TurnContext;
  gitAction: ReturnType<typeof parseGitActionMessage>;
  itemCount: number;
}

interface ItemBuilder {
  items: ConversationItem[];
  currentTurn: TurnState | null;
  pendingPrompts: Map<number, TurnState>;
  shellExecutes: Map<string, { item: UserShellExecute; index: number }>;
  isCompacting: boolean;
  nextId: () => number;
}

function createItemBuilder(): ItemBuilder {
  let idCounter = 0;
  return {
    items: [],
    currentTurn: null,
    pendingPrompts: new Map(),
    shellExecutes: new Map(),
    isCompacting: false,
    nextId: () => idCounter++,
  };
}

function isThoughtItem(
  item: ConversationItem,
): item is ConversationItem & { type: "session_update" } {
  return (
    item.type === "session_update" &&
    item.update.sessionUpdate === "agent_thought_chunk"
  );
}

function markThoughtCompletion(items: ConversationItem[]) {
  const seenContexts = new Set<TurnContext>();

  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];

    if (isThoughtItem(item)) {
      item.thoughtComplete =
        seenContexts.has(item.turnContext) || item.turnContext.turnComplete;
    }

    if (item.type === "session_update") {
      seenContexts.add(item.turnContext);
    }
  }
}

function pushItem(b: ItemBuilder, update: RenderItem) {
  const turn = b.currentTurn;
  if (!turn) return;
  turn.itemCount++;
  b.items.push({
    type: "session_update",
    id: `${turn.id}-item-${b.nextId()}`,
    update,
    turnContext: turn.context,
  });
}

export interface BuildConversationOptions {
  showDebugLogs?: boolean;
}

export function buildConversationItems(
  events: AcpMessage[],
  isPromptPending: boolean | null,
  options?: BuildConversationOptions,
): BuildResult {
  const b = createItemBuilder();

  for (const event of events) {
    const msg = event.message;

    if (isJsonRpcNotification(msg)) {
      handleNotification(b, msg, event.ts, options);
      continue;
    }

    if (isJsonRpcRequest(msg) && msg.method === "session/prompt") {
      handlePromptRequest(b, msg, event.ts);
      continue;
    }

    if (isJsonRpcResponse(msg) && b.pendingPrompts.has(msg.id)) {
      handlePromptResponse(b, msg, event.ts);
    }
  }

  // Only mark unresolved prompts as cancelled when we actively track prompt
  // state (local sessions). For cloud sessions isPromptPending is
  // null, meaning that the response hasn't streamed "in" yet
  if (isPromptPending === false) {
    for (const turn of b.pendingPrompts.values()) {
      turn.isComplete = true;
      turn.durationMs = 0;
      turn.context.turnComplete = true;
    }
  }

  // Mark implicit turn complete if it's still the current turn after all events
  if (b.currentTurn?.promptId === -1) {
    b.currentTurn.isComplete = true;
    b.currentTurn.context.turnComplete = true;
  }

  markThoughtCompletion(b.items);

  const lastTurnInfo: LastTurnInfo | null = b.currentTurn
    ? {
        isComplete: b.currentTurn.isComplete,
        durationMs: b.currentTurn.durationMs,
        stopReason: b.currentTurn.stopReason,
      }
    : null;

  return { items: b.items, lastTurnInfo, isCompacting: b.isCompacting };
}

function handlePromptRequest(
  b: ItemBuilder,
  msg: { id: number; params?: unknown },
  ts: number,
) {
  // If the current turn is the implicit one, mark it complete before starting a real turn
  if (b.currentTurn && b.currentTurn.promptId === -1) {
    b.currentTurn.isComplete = true;
    b.currentTurn.context.turnComplete = true;
  }

  const userPrompt = extractUserPrompt(msg.params);
  const userContent = userPrompt.content;

  if (userContent.trim().length === 0 && userPrompt.attachments.length === 0) {
    return;
  }

  const turnId = `turn-${ts}-${msg.id}`;
  const toolCalls = new Map<string, ToolCall>();
  const gitAction = parseGitActionMessage(userContent);

  const childItems = new Map<string, ConversationItem[]>();
  const context: TurnContext = {
    toolCalls,
    childItems,
    turnCancelled: false,
    turnComplete: false,
  };

  b.currentTurn = {
    id: turnId,
    promptId: msg.id,
    isComplete: false,
    durationMs: -ts,
    toolCalls,
    context,
    gitAction,
    itemCount: 0,
  };

  b.pendingPrompts.set(msg.id, b.currentTurn);

  if (gitAction.isGitAction && gitAction.actionType) {
    b.items.push({
      type: "git_action",
      id: `${turnId}-git-action`,
      actionType: gitAction.actionType,
    });
  } else {
    b.items.push({
      type: "user_message",
      id: `${turnId}-user`,
      content: userContent,
      timestamp: ts,
      attachments: userPrompt.attachments,
    });
  }
}

function handlePromptResponse(
  b: ItemBuilder,
  msg: { id: number; result?: unknown },
  ts: number,
) {
  const turn = b.pendingPrompts.get(msg.id);
  if (!turn) return;
  turn.isComplete = true;
  turn.durationMs += ts;

  const result = msg.result as {
    stopReason?: string;
    _meta?: { interruptReason?: string };
  };
  turn.stopReason = result?.stopReason;
  turn.interruptReason = result?._meta?.interruptReason;
  turn.context.turnComplete = true;

  const wasCancelled = turn.stopReason === "cancelled";
  turn.context.turnCancelled = wasCancelled;

  if (turn.gitAction.isGitAction && turn.gitAction.actionType) {
    b.items.push({
      type: "git_action_result",
      id: `${turn.id}-git-result`,
      actionType: turn.gitAction.actionType,
      turnId: turn.id,
    });
  }

  if (wasCancelled) {
    b.items.push({
      type: "turn_cancelled",
      id: `${turn.id}-cancelled`,
      interruptReason: turn.interruptReason,
    });
  }

  b.pendingPrompts.delete(msg.id);
}

/** Check if a method matches a PostHog notification name, accounting for
 *  the SDK sometimes double-prefixing (`__posthog/` instead of `_posthog/`). */
function isPosthogMethod(method: string, name: string): boolean {
  return method === `_posthog/${name}` || method === `__posthog/${name}`;
}

function handleNotification(
  b: ItemBuilder,
  msg: { method: string; params?: unknown },
  ts: number,
  options?: BuildConversationOptions,
) {
  if (msg.method === "_array/user_shell_execute") {
    const params = msg.params as UserShellExecuteParams;
    const existing = b.shellExecutes.get(params.id);
    if (existing) {
      existing.item.result = params.result;
    } else {
      const item: UserShellExecute = {
        type: "user_shell_execute",
        id: params.id,
        command: params.command,
        cwd: params.cwd,
        result: params.result,
      };
      b.shellExecutes.set(params.id, { item, index: b.items.length });
      b.items.push(item);
    }
    return;
  }

  if (msg.method === "session/update") {
    const update = (msg.params as SessionNotification)?.update;
    if (!update) return;
    if (!b.currentTurn) {
      ensureImplicitTurn(b, ts);
    }
    processSessionUpdate(b, update);
    return;
  }

  if (isPosthogMethod(msg.method, "console")) {
    if (!b.currentTurn) {
      ensureImplicitTurn(b, ts);
    }
    const params = msg.params as { level?: string; message?: string };
    if (!params?.message) return;
    if (params.level === "debug" && !options?.showDebugLogs) return;
    pushItem(b, {
      sessionUpdate: "console",
      level: params.level ?? "info",
      message: params.message,
      timestamp: new Date(ts).toISOString(),
    });
    return;
  }

  if (isPosthogMethod(msg.method, "compact_boundary")) {
    if (!b.currentTurn) ensureImplicitTurn(b, ts);
    const params = msg.params as {
      trigger: "manual" | "auto";
      preTokens: number;
      contextSize?: number;
    };
    markCompactingStatusComplete(b);
    pushItem(b, {
      sessionUpdate: "compact_boundary",
      trigger: params.trigger,
      preTokens: params.preTokens,
      contextSize: params.contextSize,
    });
    return;
  }

  if (isPosthogMethod(msg.method, "status")) {
    if (!b.currentTurn) ensureImplicitTurn(b, ts);
    const params = msg.params as { status: string; isComplete?: boolean };
    if (params.status === "compacting" && !params.isComplete) {
      b.isCompacting = true;
    }
    pushItem(b, {
      sessionUpdate: "status",
      status: params.status,
      isComplete: params.isComplete,
    });
    return;
  }
}

function markCompactingStatusComplete(b: ItemBuilder) {
  b.isCompacting = false;
  for (let i = b.items.length - 1; i >= 0; i--) {
    const item = b.items[i];
    if (
      item.type === "session_update" &&
      item.update.sessionUpdate === "status" &&
      item.update.status === "compacting"
    ) {
      item.update.isComplete = true;
      return;
    }
  }
}

function ensureImplicitTurn(b: ItemBuilder, ts: number) {
  if (b.currentTurn) return;

  const turnId = `turn-${ts}-implicit`;
  const toolCalls = new Map<string, ToolCall>();
  const childItems = new Map<string, ConversationItem[]>();
  const context: TurnContext = {
    toolCalls,
    childItems,
    turnCancelled: false,
    turnComplete: false,
  };

  b.currentTurn = {
    id: turnId,
    promptId: -1,
    isComplete: false,
    durationMs: 0,
    toolCalls,
    context,
    gitAction: { isGitAction: false, actionType: null, prompt: "" },
    itemCount: 0,
  };
}

function extractUserPrompt(params: unknown): {
  content: string;
  attachments: UserMessageAttachment[];
} {
  const p = params as { prompt?: ContentBlock[] };
  if (!p?.prompt?.length) {
    return { content: "", attachments: [] };
  }

  const { text, attachments } = extractPromptDisplayContent(p.prompt, {
    filterHidden: true,
  });
  return { content: text, attachments };
}

function getParentToolCallId(update: SessionUpdate): string | undefined {
  const meta = (update as Record<string, unknown>)?._meta as
    | { claudeCode?: { parentToolCallId?: string } }
    | undefined;
  return meta?.claudeCode?.parentToolCallId;
}

function pushChildItem(b: ItemBuilder, parentId: string, update: RenderItem) {
  const turn = b.currentTurn;
  if (!turn) return;
  let children = turn.context.childItems.get(parentId);
  if (!children) {
    children = [];
    turn.context.childItems.set(parentId, children);
  }
  turn.itemCount++;
  children.push({
    type: "session_update",
    id: `${turn.id}-child-${b.nextId()}`,
    update,
    turnContext: turn.context,
  });
}

function appendTextChunkToChildren(
  b: ItemBuilder,
  parentId: string,
  update: SessionUpdate & {
    sessionUpdate: "agent_message_chunk" | "agent_thought_chunk";
  },
) {
  if (update.content.type !== "text") return;
  const turn = b.currentTurn;
  if (!turn) return;
  let children = turn.context.childItems.get(parentId);
  if (!children) {
    children = [];
    turn.context.childItems.set(parentId, children);
  }

  const lastChild = children[children.length - 1];
  if (
    lastChild?.type === "session_update" &&
    lastChild.update.sessionUpdate === update.sessionUpdate &&
    "content" in lastChild.update &&
    lastChild.update.content.type === "text"
  ) {
    const prevText = (
      lastChild.update.content as { type: "text"; text: string }
    ).text;
    children[children.length - 1] = {
      ...lastChild,
      update: {
        ...lastChild.update,
        content: {
          type: "text",
          text: prevText + update.content.text,
        },
      },
    };
  } else {
    turn.itemCount++;
    children.push({
      type: "session_update",
      id: `${turn.id}-child-${b.nextId()}`,
      update: { ...update, content: { ...update.content } },
      turnContext: turn.context,
    });
  }
}

function processSessionUpdate(b: ItemBuilder, update: SessionUpdate) {
  switch (update.sessionUpdate) {
    case "user_message_chunk":
      break;

    case "agent_message_chunk":
    case "agent_thought_chunk": {
      if (update.content.type !== "text") break;
      const parentId = getParentToolCallId(update);
      if (parentId) {
        appendTextChunkToChildren(b, parentId, update);
      } else {
        appendTextChunk(b, update);
      }
      break;
    }

    case "tool_call": {
      const turn = b.currentTurn;
      if (!turn) break;
      const existing = turn.toolCalls.get(update.toolCallId);
      if (existing) {
        Object.assign(existing, update);
      } else {
        const toolCall = { ...update };
        turn.toolCalls.set(update.toolCallId, toolCall);
        const parentId = getParentToolCallId(update);
        if (parentId) {
          pushChildItem(b, parentId, toolCall);
        } else {
          pushItem(b, toolCall);
        }
      }
      break;
    }

    case "tool_call_update": {
      const turn = b.currentTurn;
      if (!turn) break;
      const existing = turn.toolCalls.get(update.toolCallId);
      if (existing) {
        const { sessionUpdate: _, ...rest } = update;
        Object.assign(existing, rest);
      }
      break;
    }

    case "plan":
    case "available_commands_update":
    case "config_option_update":
    case "usage_update":
      break;

    default: {
      const customUpdate = update as unknown as {
        sessionUpdate: string;
        content?: { type: string; text?: string };
        status?: string;
        errorType?: string;
        message?: string;
      };
      if (customUpdate.sessionUpdate === "agent_message") {
        if (customUpdate.content?.type === "text") {
          appendTextChunk(b, {
            sessionUpdate: "agent_message_chunk" as const,
            content: customUpdate.content as { type: "text"; text: string },
          });
        }
      } else if (
        customUpdate.sessionUpdate === "status" ||
        customUpdate.sessionUpdate === "error"
      ) {
        pushItem(b, customUpdate as unknown as SessionUpdate);
      }
      break;
    }
  }
}

function appendTextChunk(
  b: ItemBuilder,
  update: SessionUpdate & {
    sessionUpdate: "agent_message_chunk" | "agent_thought_chunk";
  },
) {
  if (update.content.type !== "text") return;

  const lastItem = b.items[b.items.length - 1];
  if (
    lastItem?.type === "session_update" &&
    lastItem.update.sessionUpdate === update.sessionUpdate &&
    "content" in lastItem.update &&
    lastItem.update.content.type === "text"
  ) {
    b.items[b.items.length - 1] = {
      ...lastItem,
      update: {
        ...lastItem.update,
        content: {
          type: "text",
          text: lastItem.update.content.text + update.content.text,
        },
      },
    };
  } else {
    pushItem(b, { ...update, content: { ...update.content } });
  }
}
