import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSaveClipboardImage = vi.hoisted(() => vi.fn());
const mockSaveClipboardText = vi.hoisted(() => vi.fn());

vi.mock("@renderer/trpc/client", () => ({
  trpcClient: {
    os: {
      saveClipboardImage: {
        mutate: mockSaveClipboardImage,
      },
      saveClipboardText: {
        mutate: mockSaveClipboardText,
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

  it("throws for unsupported file types", async () => {
    const file = { name: "archive.zip" } as unknown as File;
    await expect(persistBrowserFile(file)).rejects.toThrow(/Unsupported/);
  });

  it("returns the preserved filename for browser-selected text files", async () => {
    mockSaveClipboardText.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-456/config.json",
      name: "config.json",
    });

    const file = {
      name: "config.json",
      text: vi.fn().mockResolvedValue('{"ok":true}'),
    } as unknown as File;

    await expect(persistBrowserFile(file)).resolves.toEqual({
      id: "/tmp/posthog-code-clipboard/attachment-456/config.json",
      label: "config.json",
    });
    expect(mockSaveClipboardText).toHaveBeenCalledWith({
      text: '{"ok":true}',
      originalName: "config.json",
    });
  });
});
