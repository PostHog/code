import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sanitizeRepoName } from "@shared/utils/repo";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScratchpadService, ScratchpadServiceEvent } from "./service";

const fsPromises = fs.promises;

interface RunGitCall {
  cwd: string;
  args: string[];
}

class TestPublishService extends ScratchpadService {
  public token: string | null = "test-token";
  public fetchMock = vi.fn<typeof fetch>();
  public runGitMock = vi.fn<(cwd: string, args: string[]) => Promise<void>>();
  public runGitCalls: RunGitCall[] = [];
  /** When true, runGit creates the .git dir on `init` and removes it on cleanup. */
  public simulateGit = true;

  constructor(private readonly baseDir: string) {
    // GitService not needed; we override getGhAuthToken.
    super({} as never);
    this.runGitMock.mockImplementation(async (cwd, args) => {
      this.runGitCalls.push({ cwd, args });
      if (this.simulateGit && args.includes("init")) {
        await fsPromises.mkdir(path.join(cwd, ".git"), { recursive: true });
      }
    });
    this.fetchImpl = (...fetchArgs) => this.fetchMock(...fetchArgs);
  }

  protected override getBaseDir(): string {
    return this.baseDir;
  }

  protected override async getGhAuthToken(): Promise<string | null> {
    return this.token;
  }

  protected override async runGit(cwd: string, args: string[]): Promise<void> {
    return this.runGitMock(cwd, args);
  }
}

function makeFetchResponse(init: {
  ok: boolean;
  status: number;
  body?: unknown;
  text?: string;
}): Response {
  const bodyText = init.text ?? JSON.stringify(init.body ?? {});
  return {
    ok: init.ok,
    status: init.status,
    json: async () => init.body ?? {},
    text: async () => bodyText,
  } as unknown as Response;
}

describe("sanitizeRepoName", () => {
  it("collapses spaces to hyphens, preserves dots and underscores", () => {
    expect(sanitizeRepoName("My Cool App!")).toBe("My-Cool-App");
    expect(sanitizeRepoName("example.com_v2")).toBe("example.com_v2");
  });

  it("trims leading/trailing hyphens and clamps to 100 chars", () => {
    expect(sanitizeRepoName("---hello---")).toBe("hello");
    expect(sanitizeRepoName("a".repeat(150)).length).toBe(100);
  });
});

describe("ScratchpadService.publish", () => {
  let baseDir: string;
  let service: TestPublishService;

  beforeEach(async () => {
    baseDir = await fsPromises.mkdtemp(
      path.join(os.tmpdir(), "scratchpad-publish-"),
    );
    service = new TestPublishService(baseDir);
  });

  afterEach(async () => {
    await fsPromises.rm(baseDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("happy path: writes default .gitignore, runs git steps in order, patches manifest, emits Published", async () => {
    const { scratchpadPath } = await service.scaffoldEmpty(
      "task-1",
      "My App",
      42,
    );
    await fsPromises.writeFile(
      path.join(scratchpadPath, "index.html"),
      "<html></html>",
      "utf8",
    );

    service.fetchMock.mockResolvedValueOnce(
      makeFetchResponse({
        ok: true,
        status: 201,
        body: {
          ssh_url: "git@github.com:octocat/my-app.git",
          clone_url: "https://github.com/octocat/my-app.git",
          full_name: "octocat/my-app",
        },
      }),
    );

    const publishedHandler = vi.fn();
    service.on(ScratchpadServiceEvent.Published, publishedHandler);

    const result = await service.publish("task-1", {
      repoName: "my-app",
      visibility: "private",
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.repoFullName).toBe("octocat/my-app");
    expect(result.githubRemote).toBe("git@github.com:octocat/my-app.git");

    // .gitignore was written.
    const gitignore = await fsPromises.readFile(
      path.join(scratchpadPath, ".gitignore"),
      "utf8",
    );
    expect(gitignore).toContain("node_modules/");
    expect(gitignore).toContain(".env*");

    // Git steps fired in expected order.
    const gitArgsInOrder = service.runGitCalls.map((c) => c.args);
    expect(gitArgsInOrder).toEqual([
      ["-c", "init.defaultBranch=main", "init"],
      ["symbolic-ref", "HEAD", "refs/heads/main"],
      ["add", "."],
      ["commit", "-m", "Initial commit"],
      ["remote", "add", "origin", "git@github.com:octocat/my-app.git"],
      ["push", "-u", "origin", "main"],
    ]);

    // Manifest patched.
    const manifest = await service.readManifest("task-1");
    expect(manifest.published).toBe(true);
    expect(manifest.githubRemote).toBe("git@github.com:octocat/my-app.git");
    expect(manifest.publishedAt).toMatch(/T/);

    // Event emitted.
    expect(publishedHandler).toHaveBeenCalledTimes(1);
    expect(publishedHandler.mock.calls[0][0]).toMatchObject({
      taskId: "task-1",
      repoFullName: "octocat/my-app",
      githubRemote: "git@github.com:octocat/my-app.git",
    });
  });

  it("already-published manifest returns success: false, no side effects", async () => {
    await service.scaffoldEmpty("task-1", "App", 1);
    await service.writeManifest("task-1", { published: true });

    const result = await service.publish("task-1", { repoName: "x" });

    expect(result).toEqual({
      success: false,
      code: "already_published",
      message: "Already published",
    });
    expect(service.runGitMock).not.toHaveBeenCalled();
    expect(service.fetchMock).not.toHaveBeenCalled();
  });

  it("secret leakage: failure with offending paths, no git init", async () => {
    const { scratchpadPath } = await service.scaffoldEmpty("task-1", "App", 1);
    // User explicitly committed a permissive .gitignore that doesn't exclude
    // `.env` or `*.pem`. The secret guard should still flag them.
    await fsPromises.writeFile(
      path.join(scratchpadPath, ".gitignore"),
      "node_modules/\n",
      "utf8",
    );
    await fsPromises.writeFile(
      path.join(scratchpadPath, ".env"),
      "API_KEY=hunter2",
      "utf8",
    );
    await fsPromises.writeFile(
      path.join(scratchpadPath, "private.pem"),
      "-----BEGIN-----",
      "utf8",
    );

    const result = await service.publish("task-1", { repoName: "x" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.code).toBe("secret_leakage");
    expect(result.paths).toEqual(
      expect.arrayContaining([".env", "private.pem"]),
    );
    expect(service.runGitMock).not.toHaveBeenCalled();
  });

  it("respects .gitignore for the secret guard (env files in node_modules are ignored)", async () => {
    const { scratchpadPath } = await service.scaffoldEmpty("task-1", "App", 1);
    // Secret in node_modules — ignored by default .gitignore.
    await fsPromises.mkdir(path.join(scratchpadPath, "node_modules", "x"), {
      recursive: true,
    });
    await fsPromises.writeFile(
      path.join(scratchpadPath, "node_modules", "x", ".env"),
      "secret",
      "utf8",
    );

    service.fetchMock.mockResolvedValueOnce(
      makeFetchResponse({
        ok: true,
        status: 201,
        body: {
          ssh_url: "git@github.com:octocat/app.git",
          full_name: "octocat/app",
        },
      }),
    );

    const result = await service.publish("task-1", { repoName: "app" });

    expect(result.success).toBe(true);
  });

  it("GitHub 422: returns repo_name_conflict, cleans up local .git", async () => {
    const { scratchpadPath } = await service.scaffoldEmpty("task-1", "App", 1);

    service.fetchMock.mockResolvedValueOnce(
      makeFetchResponse({
        ok: false,
        status: 422,
        body: {
          message: "Repository creation failed.",
          errors: [{ message: "name already exists on this account" }],
        },
      }),
    );

    const result = await service.publish("task-1", { repoName: "app" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.code).toBe("repo_name_conflict");

    // .git was cleaned up.
    await expect(
      fsPromises.access(path.join(scratchpadPath, ".git")),
    ).rejects.toThrow();

    // Manifest still unpublished.
    const manifest = await service.readManifest("task-1");
    expect(manifest.published).toBe(false);
  });

  it("push failure after repo create: returns push_failed, leaves .git intact, manifest unchanged", async () => {
    const { scratchpadPath } = await service.scaffoldEmpty("task-1", "App", 1);

    service.fetchMock.mockResolvedValueOnce(
      makeFetchResponse({
        ok: true,
        status: 201,
        body: {
          ssh_url: "git@github.com:octocat/app.git",
          full_name: "octocat/app",
        },
      }),
    );

    // Make the push step fail.
    service.runGitMock.mockImplementation(async (cwd, args) => {
      service.runGitCalls.push({ cwd, args });
      if (args.includes("init")) {
        await fsPromises.mkdir(path.join(cwd, ".git"), { recursive: true });
        return;
      }
      if (args[0] === "push") {
        throw new Error("network unreachable");
      }
    });

    const result = await service.publish("task-1", { repoName: "app" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.code).toBe("push_failed");
    expect(result.message).toContain("octocat/app");

    // .git stays intact (so user can manually push later).
    await expect(
      fsPromises.access(path.join(scratchpadPath, ".git")),
    ).resolves.toBeUndefined();

    // Manifest still unpublished.
    const manifest = await service.readManifest("task-1");
    expect(manifest.published).toBe(false);
  });

  it("no gh token: returns no_gh_token, cleans up local .git", async () => {
    const { scratchpadPath } = await service.scaffoldEmpty("task-1", "App", 1);
    service.token = null;

    const result = await service.publish("task-1", { repoName: "app" });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.code).toBe("no_gh_token");

    await expect(
      fsPromises.access(path.join(scratchpadPath, ".git")),
    ).rejects.toThrow();
  });

  it("missing scratchpad returns git_error", async () => {
    const result = await service.publish("nonexistent", { repoName: "x" });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.code).toBe("git_error");
  });
});
