import { describe, expect, it, vi } from "vitest";

vi.mock("@posthog/git/queries", () => ({
  getChangedFiles: vi.fn(async () => new Set<string>()),
  listAllFiles: vi.fn(async () => []),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    scope: () => ({
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { getChangedFiles, listAllFiles } from "@posthog/git/queries";
import { FsService } from "./service";

function makeService() {
  const fileWatcher = { on: vi.fn() } as never;
  return new FsService(fileWatcher);
}

describe("FsService.listRepoFiles", () => {
  it("derives directory entries alongside files", async () => {
    vi.mocked(getChangedFiles).mockResolvedValue(new Set());
    vi.mocked(listAllFiles).mockResolvedValue([
      "a.ts",
      "src/b.ts",
      "src/sub/c.ts",
    ]);

    const service = makeService();
    const entries = await service.listRepoFiles("/repo");

    const dirs = entries
      .filter((e) => e.kind === "directory")
      .map((e) => e.path);
    const files = entries.filter((e) => e.kind === "file").map((e) => e.path);

    expect(dirs).toEqual(["src", "src/sub"]);
    expect(files).toEqual(["a.ts", "src/b.ts", "src/sub/c.ts"]);
  });

  it("filters directories and files by query substring", async () => {
    vi.mocked(getChangedFiles).mockResolvedValue(new Set());
    vi.mocked(listAllFiles).mockResolvedValue([
      "a.ts",
      "src/b.ts",
      "src/sub/c.ts",
    ]);

    const service = makeService();
    const entries = await service.listRepoFiles("/repo", "sub");

    expect(entries.map((e) => ({ path: e.path, kind: e.kind }))).toEqual([
      { path: "src/sub", kind: "directory" },
      { path: "src/sub/c.ts", kind: "file" },
    ]);
  });
});
