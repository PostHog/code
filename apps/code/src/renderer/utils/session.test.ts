import type { ContentBlock } from "@agentclientprotocol/sdk";
import type { AcpMessage } from "@shared/types/session-events";
import { describe, expect, it } from "vitest";

import { makeAttachmentUri } from "./promptContent";
import { extractUserPromptsFromEvents, isFatalSessionError } from "./session";

describe("isFatalSessionError", () => {
  it("detects fatal 'Internal error' pattern", () => {
    expect(isFatalSessionError("Internal error: process crashed")).toBe(true);
  });

  it("detects fatal 'process exited' pattern", () => {
    expect(isFatalSessionError("process exited with code 1")).toBe(true);
  });

  it("detects fatal 'Session not found' pattern", () => {
    expect(isFatalSessionError("Session not found")).toBe(true);
  });

  it("detects fatal 'Session did not end' pattern", () => {
    expect(isFatalSessionError("Session did not end cleanly")).toBe(true);
  });

  it("detects fatal 'not ready for writing' pattern", () => {
    expect(isFatalSessionError("not ready for writing")).toBe(true);
  });

  it("detects fatal pattern in errorDetails", () => {
    expect(isFatalSessionError("Unknown error", "Internal error: boom")).toBe(
      true,
    );
  });

  it("returns false for non-fatal errors", () => {
    expect(isFatalSessionError("Network timeout")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isFatalSessionError("")).toBe(false);
  });
});

function promptEvent(prompt: ContentBlock[], ts = 1): AcpMessage {
  return {
    type: "acp_message",
    ts,
    message: {
      jsonrpc: "2.0",
      id: ts,
      method: "session/prompt",
      params: { prompt },
    },
  };
}

describe("extractUserPromptsFromEvents", () => {
  it("extracts text from a plain text prompt", () => {
    const events = [promptEvent([{ type: "text", text: "fix the bug" }])];
    expect(extractUserPromptsFromEvents(events)).toEqual(["fix the bug"]);
  });

  it("skips hidden text blocks", () => {
    const events = [
      promptEvent([
        {
          type: "text",
          text: "hidden context",
          _meta: { ui: { hidden: true } },
        } as ContentBlock,
        { type: "text", text: "visible prompt" },
      ]),
    ];
    expect(extractUserPromptsFromEvents(events)).toEqual(["visible prompt"]);
  });

  it("returns attachment labels when prompt has no text", () => {
    const uri = makeAttachmentUri("/tmp/screenshot.png");
    const events = [
      promptEvent([
        {
          type: "resource",
          resource: { uri, text: "", mimeType: "image/png" },
        },
      ]),
    ];
    expect(extractUserPromptsFromEvents(events)).toEqual([
      "[Attached files: screenshot.png]",
    ]);
  });

  it("returns text when prompt has both text and attachments", () => {
    const uri = makeAttachmentUri("/tmp/data.csv");
    const events = [
      promptEvent([
        { type: "text", text: "analyze this" },
        { type: "resource", resource: { uri, text: "", mimeType: "text/csv" } },
      ]),
    ];
    expect(extractUserPromptsFromEvents(events)).toEqual(["analyze this"]);
  });

  it("joins multiple attachment labels with commas", () => {
    const uri1 = makeAttachmentUri("/tmp/a.png");
    const uri2 = makeAttachmentUri("/tmp/b.pdf");
    const events = [
      promptEvent([
        {
          type: "resource",
          resource: { uri: uri1, text: "", mimeType: "image/png" },
        },
        {
          type: "resource",
          resource: { uri: uri2, text: "", mimeType: "application/pdf" },
        },
      ]),
    ];
    expect(extractUserPromptsFromEvents(events)).toEqual([
      "[Attached files: a.png, b.pdf]",
    ]);
  });

  it("falls back to attachment labels when all text blocks are hidden", () => {
    const uri = makeAttachmentUri("/tmp/report.md");
    const events = [
      promptEvent([
        {
          type: "text",
          text: "hidden",
          _meta: { ui: { hidden: true } },
        } as ContentBlock,
        {
          type: "resource",
          resource: { uri, text: "", mimeType: "text/markdown" },
        },
      ]),
    ];
    expect(extractUserPromptsFromEvents(events)).toEqual([
      "[Attached files: report.md]",
    ]);
  });

  it("skips events with empty prompt arrays", () => {
    const events = [promptEvent([])];
    expect(extractUserPromptsFromEvents(events)).toEqual([]);
  });

  it("collects prompts from multiple events in order", () => {
    const uri = makeAttachmentUri("/tmp/logo.svg");
    const events = [
      promptEvent([{ type: "text", text: "first" }], 1),
      promptEvent(
        [
          {
            type: "resource",
            resource: { uri, text: "", mimeType: "image/svg+xml" },
          },
        ],
        2,
      ),
      promptEvent([{ type: "text", text: "third" }], 3),
    ];
    expect(extractUserPromptsFromEvents(events)).toEqual([
      "first",
      "[Attached files: logo.svg]",
      "third",
    ]);
  });
});
