import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ScratchpadService,
  ScratchpadServiceEvent,
  sanitizeScratchpadName,
} from "./service";

const fsPromises = fs.promises;

class TestScratchpadService extends ScratchpadService {
  constructor(private readonly baseDir: string) {
    // GitService is unused in the existing test surface; cast a stub.
    super({} as never);
  }

  protected override getBaseDir(): string {
    return this.baseDir;
  }
}

describe("sanitizeScratchpadName", () => {
  it('lowercases and hyphenates "My App!" to "my-app"', () => {
    expect(sanitizeScratchpadName("My App!")).toBe("my-app");
  });

  it("collapses runs of non-ASCII characters into single hyphens", () => {
    expect(sanitizeScratchpadName("naïve café — déjà vu")).toBe(
      "na-ve-caf-d-j-vu",
    );
  });

  it("trims leading and trailing hyphens", () => {
    expect(sanitizeScratchpadName("---hello---")).toBe("hello");
  });

  it("truncates to 64 characters", () => {
    const longName = "a".repeat(80);
    const sanitized = sanitizeScratchpadName(longName);
    expect(sanitized.length).toBe(64);
    expect(sanitized).toBe("a".repeat(64));
  });
});

describe("ScratchpadService", () => {
  let baseDir: string;
  let service: TestScratchpadService;

  beforeEach(async () => {
    baseDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "scratchpad-test-"),
    );
    service = new TestScratchpadService(baseDir);
  });

  afterEach(async () => {
    await fsPromises.rm(baseDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("scaffoldEmpty", () => {
    it("creates the directory and writes a default manifest", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "My App!",
        42,
      );

      expect(scratchpadPath).toBe(path.join(baseDir, "task-1", "my-app"));

      const stat = await fsPromises.stat(scratchpadPath);
      expect(stat.isDirectory()).toBe(true);

      const manifestRaw = await fsPromises.readFile(
        path.join(scratchpadPath, ".posthog.json"),
        "utf8",
      );
      const manifest = JSON.parse(manifestRaw);
      expect(manifest).toEqual({ projectId: 42, published: false });
    });

    it("emits a Created event", async () => {
      const handler = vi.fn();
      service.on(ScratchpadServiceEvent.Created, handler);

      await service.scaffoldEmpty("task-1", "Hello", 7);

      expect(handler).toHaveBeenCalledTimes(1);
      const payload = handler.mock.calls[0][0];
      expect(payload.taskId).toBe("task-1");
      expect(payload.name).toBe("Hello");
      expect(payload.scratchpadPath).toBe(
        path.join(baseDir, "task-1", "hello"),
      );
      expect(payload.manifest).toEqual({ projectId: 7, published: false });
    });

    it("throws when the name sanitizes to an empty string", async () => {
      await expect(service.scaffoldEmpty("task-1", "!!!", 1)).rejects.toThrow(
        /Cannot derive scratchpad directory name/,
      );
    });

    it("initializes the directory as a git repo on `main`", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "Repo Test",
        1,
      );

      // .git directory exists
      const gitStat = await fsPromises.stat(path.join(scratchpadPath, ".git"));
      expect(gitStat.isDirectory()).toBe(true);

      // Default branch is main (no commits yet — read .git/HEAD)
      const head = await fsPromises.readFile(
        path.join(scratchpadPath, ".git", "HEAD"),
        "utf8",
      );
      expect(head.trim()).toBe("ref: refs/heads/main");
    });
  });

  describe("readManifest", () => {
    it("throws when no scratchpad directory exists", async () => {
      await expect(service.readManifest("task-missing")).rejects.toThrow(
        /No scratchpad found/,
      );
    });

    it("throws when the manifest file is missing", async () => {
      const dir = path.join(baseDir, "task-1", "empty");
      await fsPromises.mkdir(dir, { recursive: true });

      await expect(service.readManifest("task-1")).rejects.toThrow();
    });

    it("throws on Zod validation failure", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "App",
        5,
      );
      await fsPromises.writeFile(
        path.join(scratchpadPath, ".posthog.json"),
        JSON.stringify({ projectId: "not-a-number", published: false }),
        "utf8",
      );

      await expect(service.readManifest("task-1")).rejects.toThrow();
    });

    it("returns the parsed manifest", async () => {
      await service.scaffoldEmpty("task-1", "App", 5);
      const manifest = await service.readManifest("task-1");
      expect(manifest).toEqual({ projectId: 5, published: false });
    });
  });

  describe("writeManifest", () => {
    it("merges the patch into the existing manifest", async () => {
      await service.scaffoldEmpty("task-1", "App", 5);
      const updated = await service.writeManifest("task-1", {
        published: true,
        publishedAt: "2026-04-26T00:00:00.000Z",
      });

      expect(updated).toEqual({
        projectId: 5,
        published: true,
        publishedAt: "2026-04-26T00:00:00.000Z",
      });

      const reread = await service.readManifest("task-1");
      expect(reread).toEqual(updated);
    });

    it("emits ManifestUpdated", async () => {
      await service.scaffoldEmpty("task-1", "App", 5);
      const handler = vi.fn();
      service.on(ScratchpadServiceEvent.ManifestUpdated, handler);

      await service.writeManifest("task-1", { published: true });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].taskId).toBe("task-1");
      expect(handler.mock.calls[0][0].manifest.published).toBe(true);
    });

    it("does not corrupt the existing manifest if rename fails mid-write", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "App",
        5,
      );
      const originalRaw = await fsPromises.readFile(
        path.join(scratchpadPath, ".posthog.json"),
        "utf8",
      );

      const renameSpy = vi
        .spyOn(fsPromises, "rename")
        .mockRejectedValueOnce(new Error("simulated crash"));

      await expect(
        service.writeManifest("task-1", { published: true }),
      ).rejects.toThrow(/simulated crash/);

      renameSpy.mockRestore();

      const afterRaw = await fsPromises.readFile(
        path.join(scratchpadPath, ".posthog.json"),
        "utf8",
      );
      expect(afterRaw).toBe(originalRaw);

      // The tmp file (if any was left behind) must not be readable as the real
      // manifest, so re-reading the manifest still yields the original state.
      const manifest = await service.readManifest("task-1");
      expect(manifest).toEqual({ projectId: 5, published: false });
    });

    it("serializes concurrent calls without losing updates", async () => {
      await service.scaffoldEmpty("task-1", "App", 5);

      // 5 parallel patches, each adding a distinct field via githubRemote/publishedAt.
      // We use `published` + `publishedAt` + `githubRemote` to verify ordered
      // merging: the last write wins for any overlapping keys, and all keys
      // present across writes survive.
      const patches = [
        { published: true },
        { publishedAt: "2026-04-26T00:00:01.000Z" },
        { githubRemote: "https://github.com/example/repo-a.git" },
        { publishedAt: "2026-04-26T00:00:02.000Z" },
        { githubRemote: "https://github.com/example/repo-b.git" },
      ];

      await Promise.all(
        patches.map((patch) => service.writeManifest("task-1", patch)),
      );

      const final = await service.readManifest("task-1");
      // All keys present, last writer wins per key.
      expect(final).toEqual({
        projectId: 5,
        published: true,
        publishedAt: "2026-04-26T00:00:02.000Z",
        githubRemote: "https://github.com/example/repo-b.git",
      });
    });
  });

  describe("delete", () => {
    it("removes the directory tree and emits Deleted", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "App",
        5,
      );
      const taskDir = path.dirname(scratchpadPath);
      const handler = vi.fn();
      service.on(ScratchpadServiceEvent.Deleted, handler);

      await service.delete("task-1");

      await expect(fsPromises.stat(taskDir)).rejects.toThrow();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0]).toEqual({ taskId: "task-1" });
    });

    it("is a no-op when the scratchpad does not exist", async () => {
      await expect(service.delete("task-missing")).resolves.toBeUndefined();
    });
  });

  describe("list", () => {
    it("returns an empty array when the base dir does not exist", async () => {
      await fsPromises.rm(baseDir, { recursive: true, force: true });
      const result = await service.list();
      expect(result).toEqual([]);
    });

    it("returns all scaffolded scratchpads", async () => {
      await service.scaffoldEmpty("task-1", "App One", 1);
      await service.scaffoldEmpty("task-2", "App Two", 2);

      const result = await service.list();
      result.sort((a, b) => a.taskId.localeCompare(b.taskId));

      expect(result).toEqual([
        {
          taskId: "task-1",
          name: "app-one",
          manifest: { projectId: 1, published: false },
        },
        {
          taskId: "task-2",
          name: "app-two",
          manifest: { projectId: 2, published: false },
        },
      ]);
    });

    it("skips scratchpads with malformed manifests", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "App",
        1,
      );
      await fsPromises.writeFile(
        path.join(scratchpadPath, ".posthog.json"),
        "{ not valid json",
        "utf8",
      );
      await service.scaffoldEmpty("task-2", "App Two", 2);

      const result = await service.list();
      expect(result).toHaveLength(1);
      expect(result[0].taskId).toBe("task-2");
    });
  });

  describe("getScratchpadPath", () => {
    it("returns the directory when present", async () => {
      const { scratchpadPath } = await service.scaffoldEmpty(
        "task-1",
        "App",
        1,
      );
      const result = await service.getScratchpadPath("task-1");
      expect(result).toBe(scratchpadPath);
    });

    it("returns null when missing", async () => {
      const result = await service.getScratchpadPath("nope");
      expect(result).toBeNull();
    });
  });
});
