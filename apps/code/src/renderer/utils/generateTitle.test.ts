import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadAbsoluteFile = vi.hoisted(() => vi.fn());

vi.mock("@renderer/trpc", () => ({
  trpcClient: {
    fs: {
      readAbsoluteFile: { query: mockReadAbsoluteFile },
    },
  },
}));

vi.mock("@features/auth/hooks/authQueries", () => ({
  fetchAuthState: vi.fn(),
}));

vi.mock("@utils/logger", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import { enrichDescriptionWithFileContent } from "./generateTitle";

describe("enrichDescriptionWithFileContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns description unchanged when it contains real text", async () => {
    const description = "Fix the login bug";
    const result = await enrichDescriptionWithFileContent(description);
    expect(result).toBe(description);
    expect(mockReadAbsoluteFile).not.toHaveBeenCalled();
  });

  it("reads text file content when description only has file tags", async () => {
    mockReadAbsoluteFile.mockResolvedValue("const x = 1;\nexport default x;");
    const description = '1. <file path="/tmp/code.ts" />';
    const result = await enrichDescriptionWithFileContent(description);
    expect(result).toBe("const x = 1;\nexport default x;");
    expect(mockReadAbsoluteFile).toHaveBeenCalledWith({
      filePath: "/tmp/code.ts",
    });
  });

  it("handles multiple file tags", async () => {
    mockReadAbsoluteFile
      .mockResolvedValueOnce("file one")
      .mockResolvedValueOnce("file two");

    const description =
      '1. <file path="/tmp/a.ts" />\n2. <file path="/tmp/b.ts" />';
    const result = await enrichDescriptionWithFileContent(description);
    expect(result).toBe("file one\n\nfile two");
  });

  it("uses filePaths argument over parsed tags", async () => {
    mockReadAbsoluteFile.mockResolvedValue("from explicit path");
    const description = '1. <file path="/tmp/ignored.ts" />';
    const result = await enrichDescriptionWithFileContent(description, [
      "/tmp/explicit.ts",
    ]);
    expect(result).toBe("from explicit path");
    expect(mockReadAbsoluteFile).toHaveBeenCalledWith({
      filePath: "/tmp/explicit.ts",
    });
  });

  it.each([
    {
      label: "binary file",
      description: '1. <file path="/tmp/screenshot.png" />',
      setup: () => {},
    },
    {
      label: "read throws",
      description: '1. <file path="/tmp/missing.ts" />',
      setup: () => mockReadAbsoluteFile.mockRejectedValue(new Error("ENOENT")),
    },
    {
      label: "read returns null",
      description: '1. <file path="/tmp/empty.ts" />',
      setup: () => mockReadAbsoluteFile.mockResolvedValue(null),
    },
  ])(
    "falls back to filename hint -- $label",
    async ({ description, setup }) => {
      setup();
      const result = await enrichDescriptionWithFileContent(description);
      const filename = description.match(/path="[^"]*\/([^"]+)"/)?.[1];
      expect(result).toBe(`[Attached: ${filename}]`);
    },
  );

  it("truncates content longer than 500 chars", async () => {
    const longContent = "x".repeat(600);
    mockReadAbsoluteFile.mockResolvedValue(longContent);
    const description = '1. <file path="/tmp/big.ts" />';
    const result = await enrichDescriptionWithFileContent(description);
    expect(result).toBe("x".repeat(500));
  });

  it("strips 'Attached files:' lines when checking for real text", async () => {
    mockReadAbsoluteFile.mockResolvedValue("content");
    const description = '1. <file path="/tmp/a.ts" />\nAttached files: a.ts';
    const result = await enrichDescriptionWithFileContent(description);
    expect(result).toBe("content");
  });

  it("returns original description when no file paths found", async () => {
    const description = "1. \n2. ";
    const result = await enrichDescriptionWithFileContent(description);
    expect(result).toBe(description);
  });

  it("mixes binary and text files", async () => {
    mockReadAbsoluteFile.mockResolvedValue("text content");
    const result = await enrichDescriptionWithFileContent("", [
      "/tmp/image.jpg",
      "/tmp/code.ts",
    ]);
    expect(result).toBe("[Attached: image.jpg]\n\ntext content");
  });
});
