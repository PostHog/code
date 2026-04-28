import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSaveClipboardImage = vi.hoisted(() => vi.fn());
const mockSaveClipboardText = vi.hoisted(() => vi.fn());
const mockSaveClipboardFile = vi.hoisted(() => vi.fn());

vi.mock("@renderer/trpc/client", () => ({
  trpcClient: {
    os: {
      saveClipboardImage: {
        mutate: mockSaveClipboardImage,
      },
      saveClipboardText: {
        mutate: mockSaveClipboardText,
      },
      saveClipboardFile: {
        mutate: mockSaveClipboardFile,
      },
    },
  },
}));

vi.mock("@features/code-editor/utils/imageUtils", () => ({
  getImageMimeType: () => "image/png",
}));

import {
  persistBrowserFile,
  persistImageFile,
  persistTextContent,
} from "./persistFile";

describe("persistFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes original text filenames through clipboard persistence", async () => {
    mockSaveClipboardText.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-123/notes.md",
      name: "notes.md",
    });

    const result = await persistTextContent("# hello", "notes.md");

    expect(mockSaveClipboardText).toHaveBeenCalledWith({
      text: "# hello",
      originalName: "notes.md",
    });
    expect(result).toEqual({
      path: "/tmp/posthog-code-clipboard/attachment-123/notes.md",
      name: "notes.md",
    });
  });

  it("persists image files via saveClipboardImage", async () => {
    mockSaveClipboardImage.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-789/photo.png",
      name: "photo.png",
      mimeType: "image/png",
    });

    const file = {
      name: "photo.png",
      type: "image/png",
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as File;

    const result = await persistImageFile(file);

    expect(mockSaveClipboardImage).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "image/png",
        originalName: "photo.png",
      }),
    );
    expect(result).toEqual({
      path: "/tmp/posthog-code-clipboard/attachment-789/photo.png",
      name: "photo.png",
      mimeType: "image/png",
    });
  });

  it("routes image files through persistBrowserFile", async () => {
    mockSaveClipboardImage.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-abc/img.png",
      name: "img.png",
      mimeType: "image/png",
    });

    const file = {
      name: "img.png",
      type: "image/png",
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as File;

    const result = await persistBrowserFile(file);

    expect(result).toEqual({
      id: "/tmp/posthog-code-clipboard/attachment-abc/img.png",
      label: "img.png",
    });
  });

  it("persists arbitrary non-image files via saveClipboardFile", async () => {
    mockSaveClipboardFile.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-def/archive.zip",
      name: "archive.zip",
    });

    const file = {
      name: "archive.zip",
      type: "application/zip",
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as File;

    await expect(persistBrowserFile(file)).resolves.toEqual({
      id: "/tmp/posthog-code-clipboard/attachment-def/archive.zip",
      label: "archive.zip",
    });

    expect(mockSaveClipboardFile).toHaveBeenCalledWith({
      base64Data: expect.any(String),
      originalName: "archive.zip",
    });
  });

  it("returns the preserved filename for browser-selected text files", async () => {
    mockSaveClipboardFile.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-456/config.json",
      name: "config.json",
    });

    const file = {
      name: "config.json",
      type: "application/json",
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    } as unknown as File;

    await expect(persistBrowserFile(file)).resolves.toEqual({
      id: "/tmp/posthog-code-clipboard/attachment-456/config.json",
      label: "config.json",
    });
    expect(mockSaveClipboardFile).toHaveBeenCalledWith({
      base64Data: expect.any(String),
      originalName: "config.json",
    });
  });
});
