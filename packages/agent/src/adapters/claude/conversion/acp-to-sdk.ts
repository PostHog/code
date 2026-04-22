import * as path from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptRequest } from "@agentclientprotocol/sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import type { ContentBlockParam } from "@anthropic-ai/sdk/resources";

type ImageMimeType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function sdkText(value: string): ContentBlockParam {
  return { type: "text", text: value };
}

function formatUriAsLink(uri: string): string {
  try {
    if (uri.startsWith("zed://")) {
      const name = path.basename(uri) || uri;
      return `[@${name}](${uri})`;
    }
    return uri;
  } catch {
    return uri;
  }
}

function formatFileAttachment(uri: string): string {
  try {
    const filePath = fileURLToPath(uri);
    const name = path.basename(filePath) || filePath;
    return [
      "Attached file available in the workspace:",
      `- name: ${name}`,
      `- path: ${filePath}`,
      "Use the available tools to inspect this file if needed.",
    ].join("\n");
  } catch {
    return `Attached file available at ${uri}`;
  }
}

function transformMcpCommand(text: string): string {
  const mcpMatch = text.match(/^\/mcp:([^:\s]+):(\S+)(\s+.*)?$/);
  if (mcpMatch) {
    const [, server, command, args] = mcpMatch;
    return `/${server}:${command} (MCP)${args || ""}`;
  }
  return text;
}

function processPromptChunk(
  chunk: PromptRequest["prompt"][number],
  content: ContentBlockParam[],
  context: ContentBlockParam[],
): void {
  switch (chunk.type) {
    case "text":
      content.push(sdkText(transformMcpCommand(chunk.text)));
      break;

    case "resource_link":
      content.push(
        sdkText(
          chunk.uri.startsWith("file://")
            ? formatFileAttachment(chunk.uri)
            : formatUriAsLink(chunk.uri),
        ),
      );
      break;

    case "resource":
      if ("text" in chunk.resource) {
        content.push(sdkText(formatUriAsLink(chunk.resource.uri)));
        context.push(
          sdkText(
            `\n<context ref="${chunk.resource.uri}">\n${chunk.resource.text}\n</context>`,
          ),
        );
      }
      break;

    case "image":
      if (chunk.data) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            data: chunk.data,
            media_type: chunk.mimeType as ImageMimeType,
          },
        });
      } else if (chunk.uri?.startsWith("http")) {
        content.push({
          type: "image",
          source: { type: "url", url: chunk.uri },
        });
      }
      break;

    default:
      break;
  }
}

export function promptToClaude(prompt: PromptRequest): SDKUserMessage {
  const content: ContentBlockParam[] = [];
  const context: ContentBlockParam[] = [];

  const prContext = (prompt._meta as Record<string, unknown> | undefined)
    ?.prContext;
  if (typeof prContext === "string") {
    content.push(sdkText(prContext));
  }

  for (const chunk of prompt.prompt) {
    processPromptChunk(chunk, content, context);
  }

  content.push(...context);

  return {
    type: "user",
    message: { role: "user", content },
    session_id: prompt.sessionId,
    parent_tool_use_id: null,
  };
}
