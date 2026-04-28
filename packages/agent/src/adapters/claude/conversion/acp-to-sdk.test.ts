import { describe, expect, it } from "vitest";
import { promptToClaude } from "./acp-to-sdk";

describe("promptToClaude", () => {
  it("renders file resource links as explicit workspace attachments", () => {
    const result = promptToClaude({
      sessionId: "session-1",
      prompt: [
        {
          type: "resource_link",
          uri: "file:///tmp/workspace/.posthog/attachments/run-1/report.pdf",
          name: "report.pdf",
        },
      ],
    });

    expect(result.message.content).toEqual([
      {
        type: "text",
        text: [
          "Attached file available in the workspace:",
          "- name: report.pdf",
          "- path: /tmp/workspace/.posthog/attachments/run-1/report.pdf",
          "Use the available tools to inspect this file if needed.",
        ].join("\n"),
      },
    ]);
  });

  it("preserves non-file resource links as links", () => {
    const result = promptToClaude({
      sessionId: "session-1",
      prompt: [
        {
          type: "resource_link",
          uri: "https://example.com/report.pdf",
          name: "report.pdf",
        },
      ],
    });

    expect(result.message.content).toEqual([
      {
        type: "text",
        text: "https://example.com/report.pdf",
      },
    ]);
  });
});
