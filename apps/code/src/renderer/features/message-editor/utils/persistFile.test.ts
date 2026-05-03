import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSaveClipboardImage = vi.hoisted(() => vi.fn());
const mockSaveClipboardText = vi.hoisted(() => vi.fn());
const mockSaveClipboardFile = vi.hoisted(() => vi.fn());
const mockDownscaleImageFile = vi.hoisted(() => vi.fn());
const mockGetFilePath = vi.hoisted(() => vi.fn());

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
      downscaleImageFile: {
        mutate: mockDownscaleImageFile,
      },
    },
  },
}));

vi.mock("@features/code-editor/utils/imageUtils", () => ({
  getImageMimeType: () => "image/png",
}));

vi.mock("@utils/getFilePath", () => ({
  getFilePath: mockGetFilePath,
}));

import {
  persistBrowserFile,
  persistImageFile,
  persistImageFilePath,
  persistTextContent,
  resolveDroppedFile,
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

describe("persistImageFilePath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls downscaleImageFile and returns { id, label }", async () => {
    mockDownscaleImageFile.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-aaa/photo.jpg",
      name: "photo.jpg",
      mimeType: "image/jpeg",
    });

    const result = await persistImageFilePath(
      "/Users/me/Desktop/photo.png",
      "photo.png",
    );

    expect(mockDownscaleImageFile).toHaveBeenCalledWith({
      filePath: "/Users/me/Desktop/photo.png",
    });
    expect(result).toEqual({
      id: "/tmp/posthog-code-clipboard/attachment-aaa/photo.jpg",
      label: "photo.png",
    });
  });

  it("propagates errors from downscaleImageFile", async () => {
    mockDownscaleImageFile.mockRejectedValue(new Error("Image too large"));

    await expect(
      persistImageFilePath("/big/image.png", "image.png"),
    ).rejects.toThrow("Image too large");
  });
});

describe("resolveDroppedFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when getFilePath returns empty string", async () => {
    mockGetFilePath.mockReturnValue("");

    const file = { name: "test.txt" } as File;
    expect(await resolveDroppedFile(file)).toBeNull();
  });

  it("returns file attachment directly for non-image files", async () => {
    mockGetFilePath.mockReturnValue("/Users/me/doc.pdf");

    const file = { name: "doc.pdf" } as File;
    const result = await resolveDroppedFile(file);

    expect(result).toEqual({ id: "/Users/me/doc.pdf", label: "doc.pdf" });
    expect(mockDownscaleImageFile).not.toHaveBeenCalled();
  });

  it("routes image files through downscaleImageFile", async () => {
    mockGetFilePath.mockReturnValue("/Users/me/photo.png");
    mockDownscaleImageFile.mockResolvedValue({
      path: "/tmp/posthog-code-clipboard/attachment-bbb/photo.jpg",
      name: "photo.jpg",
      mimeType: "image/jpeg",
    });

    const file = { name: "photo.png" } as File;
    const result = await resolveDroppedFile(file);

    expect(mockDownscaleImageFile).toHaveBeenCalledWith({
      filePath: "/Users/me/photo.png",
    });
    expect(result).toEqual({
      id: "/tmp/posthog-code-clipboard/attachment-bbb/photo.jpg",
      label: "photo.png",
    });
  });

  it("returns null when image downscaling fails", async () => {
    mockGetFilePath.mockReturnValue("/Users/me/corrupt.png");
    mockDownscaleImageFile.mockRejectedValue(new Error("decode failed"));

    const file = { name: "corrupt.png" } as File;
    expect(await resolveDroppedFile(file)).toBeNull();
  });
});
