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
});
