import type { ContentBlock } from "@agentclientprotocol/sdk";
import { describe, expect, it, vi } from "vitest";

vi.mock("@renderer/trpc/client", () => ({
  trpcClient: {
    fs: {
      readFileAsBase64: {
        query: vi.fn(),
      },
    },
  },
}));

import { trpcClient } from "@renderer/trpc/client";

import {
  CLOUD_ATTACHMENT_MAX_SIZE_BYTES,
  CLOUD_PDF_ATTACHMENT_MAX_SIZE_BYTES,
  combineQueuedCloudPrompts,
  promptToQueuedEditorContent,
  uploadRunAttachments,
} from "./cloudArtifacts";

describe("cloudArtifacts", () => {
  it("preserves attachment blocks when combining queued cloud prompts", () => {
    const prompt: ContentBlock[] = [
      { type: "text", text: "read this" },
      {
        type: "resource_link",
        uri: "file:///tmp/test.txt",
        name: "test.txt",
        mimeType: "text/plain",
      },
    ];

    expect(
      combineQueuedCloudPrompts([
        {
          content: "read this\n\nAttached files: test.txt",
          rawPrompt: prompt,
        },
      ]),
    ).toEqual(prompt);
  });

  it("rejects attachments that exceed the max size", async () => {
    const oversizedByteLength = CLOUD_ATTACHMENT_MAX_SIZE_BYTES + 1;
    const base64 = btoa("a".repeat(oversizedByteLength));
    vi.mocked(trpcClient.fs.readFileAsBase64.query).mockResolvedValueOnce(
      base64,
    );

    const client = {
      prepareTaskRunArtifactUploads: vi.fn(),
      finalizeTaskRunArtifactUploads: vi.fn(),
    } as never;

    await expect(
      uploadRunAttachments(client, "task-1", "run-1", ["/tmp/huge.bin"]),
    ).rejects.toThrow(/exceeds the 30MB attachment limit/);
  });

  it("rejects PDFs that exceed the stricter cloud limit", async () => {
    const oversizedByteLength = CLOUD_PDF_ATTACHMENT_MAX_SIZE_BYTES + 1;
    const base64 = btoa("a".repeat(oversizedByteLength));
    vi.mocked(trpcClient.fs.readFileAsBase64.query).mockResolvedValueOnce(
      base64,
    );

    const client = {
      prepareTaskRunArtifactUploads: vi.fn(),
      finalizeTaskRunArtifactUploads: vi.fn(),
    } as never;

    await expect(
      uploadRunAttachments(client, "task-1", "run-1", ["/tmp/large.pdf"]),
    ).rejects.toThrow(
      /exceeds the 10MB attachment limit for PDFs in cloud runs/,
    );
  });

  it("restores queued editor content with attachments from prompt blocks", () => {
    const prompt: ContentBlock[] = [
      { type: "text", text: "read this" },
      {
        type: "resource_link",
        uri: "file:///tmp/test.txt",
        name: "test.txt",
        mimeType: "text/plain",
      },
    ];

    expect(promptToQueuedEditorContent(prompt)).toEqual({
      segments: [{ type: "text", text: "read this" }],
      attachments: [{ id: "/tmp/test.txt", label: "test.txt" }],
    });
  });
});
