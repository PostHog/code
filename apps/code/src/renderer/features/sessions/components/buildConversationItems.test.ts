import type { AcpMessage } from "@shared/types/session-events";
import { makeAttachmentUri } from "@utils/promptContent";
import { describe, expect, it } from "vitest";
import { buildConversationItems } from "./buildConversationItems";

describe("buildConversationItems", () => {
  it("extracts cloud prompt attachments into user messages", () => {
    const uri = makeAttachmentUri("/tmp/hello world.txt");

    const events: AcpMessage[] = [
      {
        type: "acp_message",
        ts: 1,
        message: {
          jsonrpc: "2.0",
          id: 1,
          method: "session/prompt",
          params: {
            prompt: [
              { type: "text", text: "read this file" },
              {
                type: "resource",
                resource: {
                  uri,
                  text: "watup",
                  mimeType: "text/plain",
                },
              },
            ],
          },
        },
      },
    ];

    const result = buildConversationItems(events, null);

    expect(result.items).toEqual([
      {
        type: "user_message",
        id: "turn-1-1-user",
        content: "read this file",
        timestamp: 1,
        attachments: [
          {
            id: uri,
            label: "hello world.txt",
          },
        ],
      },
    ]);
  });

  it("keeps attachment-only prompts visible", () => {
    const uri = makeAttachmentUri("/tmp/test.txt");

    const events: AcpMessage[] = [
      {
        type: "acp_message",
        ts: 1,
        message: {
          jsonrpc: "2.0",
          id: 1,
          method: "session/prompt",
          params: {
            prompt: [
              {
                type: "resource",
                resource: {
                  uri,
                  text: "watup",
                  mimeType: "text/plain",
                },
              },
            ],
          },
        },
      },
    ];

    const result = buildConversationItems(events, null);

    expect(result.items).toEqual([
      {
        type: "user_message",
        id: "turn-1-1-user",
        content: "",
        timestamp: 1,
        attachments: [
          {
            id: uri,
            label: "test.txt",
          },
        ],
      },
    ]);
  });

  it("extracts cloud resource_link attachments into user messages", () => {
    const fileUri = "file:///tmp/workspace/attachments/Receipt-2264-0277.pdf";

    const events: AcpMessage[] = [
      {
        type: "acp_message",
        ts: 1,
        message: {
          jsonrpc: "2.0",
          id: 1,
          method: "session/prompt",
          params: {
            prompt: [
              { type: "text", text: "what is this about?" },
              {
                type: "resource_link",
                uri: fileUri,
                name: "Receipt-2264-0277.pdf",
              },
            ],
          },
        },
      },
    ];

    const result = buildConversationItems(events, null);

    expect(result.items).toEqual([
      {
        type: "user_message",
        id: "turn-1-1-user",
        content: "what is this about?",
        timestamp: 1,
        attachments: [
          {
            id: fileUri,
            label: "Receipt-2264-0277.pdf",
          },
        ],
      },
    ]);
  });
});
