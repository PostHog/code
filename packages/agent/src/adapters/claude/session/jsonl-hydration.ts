import { randomUUID } from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { StoredEntry } from "../../../types.js";

interface ConversationTurn {
  role: "user" | "assistant";
  content: ContentBlock[];
  toolCalls?: ToolCallInfo[];
}

interface ToolCallInfo {
  toolCallId: string;
  toolName: string;
  input: unknown;
  result?: unknown;
}

interface JsonlConfig {
  sessionId: string;
  cwd: string;
}

export function getSessionJsonlPath(sessionId: string, cwd: string): string {
  const configDir =
    process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const projectKey = cwd.replace(/\//g, "-");
  return path.join(configDir, "projects", projectKey, `${sessionId}.jsonl`);
}

export function rebuildConversation(
  entries: StoredEntry[],
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  let currentAssistantContent: ContentBlock[] = [];
  let currentToolCalls: ToolCallInfo[] = [];

  for (const entry of entries) {
    const method = entry.notification?.method;
    const params = entry.notification?.params as Record<string, unknown>;

    if (method === "session/update" && params?.update) {
      const update = params.update as Record<string, unknown>;
      const sessionUpdate = update.sessionUpdate as string;

      switch (sessionUpdate) {
        case "user_message":
        case "user_message_chunk": {
          if (
            currentAssistantContent.length > 0 ||
            currentToolCalls.length > 0
          ) {
            turns.push({
              role: "assistant",
              content: currentAssistantContent,
              toolCalls:
                currentToolCalls.length > 0 ? currentToolCalls : undefined,
            });
            currentAssistantContent = [];
            currentToolCalls = [];
          }

          const content = update.content as ContentBlock | ContentBlock[];
          const contentArray = Array.isArray(content) ? content : [content];
          turns.push({ role: "user", content: contentArray });
          break;
        }

        case "agent_message":
        case "agent_message_chunk": {
          const content = update.content as ContentBlock | undefined;
          if (content) {
            if (
              content.type === "text" &&
              currentAssistantContent.length > 0 &&
              currentAssistantContent[currentAssistantContent.length - 1]
                .type === "text"
            ) {
              const lastBlock = currentAssistantContent[
                currentAssistantContent.length - 1
              ] as { type: "text"; text: string };
              lastBlock.text += (
                content as { type: "text"; text: string }
              ).text;
            } else {
              currentAssistantContent.push(content);
            }
          }
          break;
        }

        case "tool_call":
        case "tool_call_update": {
          const meta = (update._meta as Record<string, unknown>)?.claudeCode as
            | Record<string, unknown>
            | undefined;
          if (meta) {
            const toolCallId = meta.toolCallId as string | undefined;
            const toolName = meta.toolName as string | undefined;
            const toolInput = meta.toolInput;
            const toolResponse = meta.toolResponse;

            if (toolCallId && toolName) {
              let toolCall = currentToolCalls.find(
                (tc) => tc.toolCallId === toolCallId,
              );
              if (!toolCall) {
                toolCall = { toolCallId, toolName, input: toolInput };
                currentToolCalls.push(toolCall);
              }
              if (toolResponse !== undefined) {
                toolCall.result = toolResponse;
              }
            }
          }
          break;
        }

        case "tool_result": {
          const meta = (update._meta as Record<string, unknown>)?.claudeCode as
            | Record<string, unknown>
            | undefined;
          if (meta) {
            const toolCallId = meta.toolCallId as string | undefined;
            const toolResponse = meta.toolResponse;
            if (toolCallId) {
              const toolCall = currentToolCalls.find(
                (tc) => tc.toolCallId === toolCallId,
              );
              if (toolCall && toolResponse !== undefined) {
                toolCall.result = toolResponse;
              }
            }
          }
          break;
        }
      }
    }
  }

  if (currentAssistantContent.length > 0 || currentToolCalls.length > 0) {
    turns.push({
      role: "assistant",
      content: currentAssistantContent,
      toolCalls: currentToolCalls.length > 0 ? currentToolCalls : undefined,
    });
  }

  return turns;
}

export function conversationTurnsToJsonlEntries(
  turns: ConversationTurn[],
  config: JsonlConfig,
): string[] {
  const lines: string[] = [];
  let parentUuid: string | null = null;

  for (const turn of turns) {
    if (turn.role === "user") {
      const uuid = randomUUID();
      const contentText = turn.content
        .map((block) => {
          if (typeof block === "string") return block;
          if (
            typeof block === "object" &&
            block !== null &&
            "text" in block &&
            typeof (block as { text: string }).text === "string"
          ) {
            return (block as { text: string }).text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");

      lines.push(
        JSON.stringify({
          parentUuid,
          isSidechain: false,
          userType: "external",
          cwd: config.cwd,
          sessionId: config.sessionId,
          version: "0.0.0",
          type: "user",
          message: { role: "user", content: contentText || " " },
          uuid,
          timestamp: new Date().toISOString(),
        }),
      );
      parentUuid = uuid;
    } else {
      const contentBlocks: unknown[] = [];

      for (const block of turn.content) {
        if (typeof block !== "object" || block === null || !("type" in block))
          continue;
        const typed = block as { type: string };
        if (typed.type === "thinking" || typed.type === "text") {
          contentBlocks.push(block);
        }
      }

      if (turn.toolCalls) {
        for (const tc of turn.toolCalls) {
          contentBlocks.push({
            type: "tool_use",
            id: tc.toolCallId,
            name: tc.toolName,
            input: tc.input,
          });
        }
      }

      if (contentBlocks.length > 0) {
        const uuid = randomUUID();
        lines.push(
          JSON.stringify({
            parentUuid,
            isSidechain: false,
            userType: "external",
            cwd: config.cwd,
            sessionId: config.sessionId,
            version: "0.0.0",
            type: "assistant",
            message: { role: "assistant", content: contentBlocks },
            uuid,
            timestamp: new Date().toISOString(),
          }),
        );
        parentUuid = uuid;
      }

      if (turn.toolCalls) {
        for (const tc of turn.toolCalls) {
          if (tc.result === undefined) continue;

          const uuid = randomUUID();
          const resultContent =
            typeof tc.result === "string"
              ? tc.result
              : JSON.stringify(tc.result);

          lines.push(
            JSON.stringify({
              parentUuid,
              isSidechain: false,
              userType: "external",
              cwd: config.cwd,
              sessionId: config.sessionId,
              version: "0.0.0",
              type: "user",
              message: {
                role: "user",
                content: [
                  {
                    type: "tool_result",
                    tool_use_id: tc.toolCallId,
                    content: resultContent,
                  },
                ],
              },
              uuid,
              timestamp: new Date().toISOString(),
            }),
          );
          parentUuid = uuid;
        }
      }
    }
  }

  return lines;
}
