import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { REPO_NAME_RE, sanitizeRepoName } from "@shared/utils/repo";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import type { GitService } from "../git/service";
import { getScratchpadLocation } from "../settingsStore";
import {
  type CreatedEventPayload,
  type DeletedEventPayload,
  type Manifest,
  type ManifestPatch,
  type ManifestUpdatedEventPayload,
  manifestSchema,
  type PreviewExitedEventPayload,
  type PreviewReadyEventPayload,
  type PreviewRegisteredEventPayload,
  type PublishedEventPayload,
  type PublishResult,
  type PublishVisibility,
  type ScratchpadListEntry,
} from "./schemas";

const execFileAsync = promisify(execFile);

const fsPromises = fs.promises;

const log = logger.scope("scratchpad-service");
const publishLog = logger.scope("scratchpad-publish");

const MANIFEST_FILE = ".posthog.json";
const MANIFEST_TMP_FILE = ".posthog.json.tmp";
const MAX_NAME_LENGTH = 64;

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const SECRET_FILENAME_PATTERNS = [/^\.env/, /\.pem$/, /\.key$/];

const DEFAULT_GITIGNORE = `node_modules/
.env*
dist/
build/
.DS_Store
*.pem
*.key
.next/
.vite/
.posthog.json
.posthog.json.tmp
`;

// `REPO_NAME_RE` and `sanitizeRepoName` live in `@shared/utils/repo` so the
// renderer's PublishDialog can validate using the exact same rules.

export const ScratchpadServiceEvent = {
  Created: "created",
  ManifestUpdated: "manifestUpdated",
  PreviewRegistered: "previewRegistered",
  PreviewReady: "previewReady",
  PreviewExited: "previewExited",
  Published: "published",
  Deleted: "deleted",
} as const;

export interface ScratchpadServiceEvents {
  [ScratchpadServiceEvent.Created]: CreatedEventPayload;
  [ScratchpadServiceEvent.ManifestUpdated]: ManifestUpdatedEventPayload;
  [ScratchpadServiceEvent.PreviewRegistered]: PreviewRegisteredEventPayload;
  [ScratchpadServiceEvent.PreviewReady]: PreviewReadyEventPayload;
  [ScratchpadServiceEvent.PreviewExited]: PreviewExitedEventPayload;
  [ScratchpadServiceEvent.Published]: PublishedEventPayload;
  [ScratchpadServiceEvent.Deleted]: DeletedEventPayload;
}

/**
 * Sanitize a user-supplied name into a directory-safe slug:
 * - lowercase
 * - non-alphanumeric ASCII collapsed to a single `-`
 * - trim leading/trailing `-`
 * - max 64 chars
 */
export function sanitizeScratchpadName(name: string): string {
  const lowered = name.toLowerCase();
  // Replace any run of non-ASCII-alphanumerics with a single hyphen.
  const replaced = lowered.replace(/[^a-z0-9]+/g, "-");
  const trimmed = replaced.replace(/^-+|-+$/g, "");
  return trimmed.slice(0, MAX_NAME_LENGTH).replace(/-+$/g, "");
}

@injectable()
export class ScratchpadService extends TypedEventEmitter<ScratchpadServiceEvents> {
  /** Per-taskId mutex chain to serialize writeManifest calls. */
  private readonly writeChains = new Map<string, Promise<unknown>>();

  constructor(
    @inject(MAIN_TOKENS.GitService)
    private readonly gitService: GitService,
  ) {
    super();
  }

  /**
   * Override-point for tests; production code returns the configured
   * `<userData>/scratchpads/` directory.
   */
  protected getBaseDir(): string {
    return getScratchpadLocation();
  }

  /**
   * Override-point for tests. Returns the GitHub OAuth/CLI token used to call
   * the GitHub REST API. Returns null when no token is available.
   */
  protected async getGhAuthToken(): Promise<string | null> {
    if (!this.gitService) return null;
    const result = await this.gitService.getGhAuthToken();
    return result.success ? result.token : null;
  }

  /**
   * Override-point for tests; production calls `fetch`.
   */
  protected fetchImpl: typeof fetch = (...args) => fetch(...args);

  /**
   * Override-point for tests; production runs `git` directly via `execFile`.
   */
  protected async runGit(cwd: string, args: string[]): Promise<void> {
    await execFileAsync("git", args, { cwd });
  }

  private getTaskDir(taskId: string): string {
    return path.join(this.getBaseDir(), taskId);
  }

  /**
   * Returns the full scratchpad directory (`<base>/<taskId>/<sanitizedName>`)
   * if it exists on disk, otherwise null.
   */
  public async getScratchpadPath(taskId: string): Promise<string | null> {
    const taskDir = this.getTaskDir(taskId);
    let entries: fs.Dirent[];
    try {
      entries = await fsPromises.readdir(taskDir, { withFileTypes: true });
    } catch {
      return null;
    }
    const dir = entries.find((e) => e.isDirectory());
    return dir ? path.join(taskDir, dir.name) : null;
  }

  /**
   * Create a fresh scratchpad directory for `taskId` named `<sanitized(name)>`,
   * write a default manifest with `published: false`, and emit `Created`.
   */
  public async scaffoldEmpty(
    taskId: string,
    name: string,
    projectId: number | null | undefined,
  ): Promise<{ scratchpadPath: string }> {
    const sanitized = sanitizeScratchpadName(name);
    if (!sanitized) {
      throw new Error(`Cannot derive scratchpad directory name from "${name}"`);
    }
    const scratchpadPath = path.join(this.getTaskDir(taskId), sanitized);

    const normalizedProjectId = projectId ?? null;
    log.info("Scaffolding scratchpad", {
      taskId,
      name,
      sanitized,
      projectId: normalizedProjectId,
    });

    await fsPromises.mkdir(scratchpadPath, { recursive: true });

    // Initialize as a git repo immediately. Most folder-aware UI in the app
    // (file watchers, status bar, "Changes" panel) assumes a git directory,
    // and refusing to init until publish-time leaves the user stuck on a
    // "This folder is not a git repository" warning the moment the
    // scratchpad opens. Default branch `main`, no commits yet.
    try {
      await execFileAsync("git", ["init", "-b", "main"], {
        cwd: scratchpadPath,
      });
    } catch (err) {
      log.error("Failed to git-init scratchpad", { scratchpadPath, err });
      throw new Error(
        `Failed to initialize git repository in scratchpad: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    const manifest: Manifest = {
      projectId: normalizedProjectId,
      published: false,
    };

    await this.writeManifestAtomic(scratchpadPath, manifest);

    this.emit(ScratchpadServiceEvent.Created, {
      taskId,
      name,
      scratchpadPath,
      manifest,
    });

    return { scratchpadPath };
  }

  /**
   * Reads `<scratchpad>/.posthog.json`. Throws if the file is missing or fails
   * Zod validation.
   */
  public async readManifest(taskId: string): Promise<Manifest> {
    const scratchpadPath = await this.getScratchpadPath(taskId);
    if (!scratchpadPath) {
      throw new Error(`No scratchpad found for taskId "${taskId}"`);
    }
    return this.readManifestFromPath(scratchpadPath);
  }

  private async readManifestFromPath(
    scratchpadPath: string,
  ): Promise<Manifest> {
    const manifestPath = path.join(scratchpadPath, MANIFEST_FILE);
    const raw = await fsPromises.readFile(manifestPath, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(
        `Manifest at ${manifestPath} is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return manifestSchema.parse(parsed);
  }

  /**
   * Atomically merge `patch` into the manifest. Writes are serialized per
   * taskId via an in-process promise chain.
   */
  public async writeManifest(
    taskId: string,
    patch: ManifestPatch,
  ): Promise<Manifest> {
    return this.runSerialized(taskId, async () => {
      const scratchpadPath = await this.getScratchpadPath(taskId);
      if (!scratchpadPath) {
        throw new Error(`No scratchpad found for taskId "${taskId}"`);
      }
      const current = await this.readManifestFromPath(scratchpadPath);
      const merged: Manifest = manifestSchema.parse({ ...current, ...patch });
      await this.writeManifestAtomic(scratchpadPath, merged);

      this.emit(ScratchpadServiceEvent.ManifestUpdated, {
        taskId,
        manifest: merged,
      });

      return merged;
    });
  }

  /**
   * Atomic write: write to `.posthog.json.tmp`, then rename to `.posthog.json`.
   * If the rename fails, the existing manifest is left untouched.
   */
  private async writeManifestAtomic(
    scratchpadPath: string,
    manifest: Manifest,
  ): Promise<void> {
    const tmpPath = path.join(scratchpadPath, MANIFEST_TMP_FILE);
    const finalPath = path.join(scratchpadPath, MANIFEST_FILE);
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    await fsPromises.writeFile(tmpPath, serialized, "utf8");
    try {
      await fsPromises.rename(tmpPath, finalPath);
    } catch (error) {
      // Best-effort cleanup of the tmp file; rethrow the original error.
      try {
        await fsPromises.unlink(tmpPath);
      } catch {
        // ignore
      }
      throw error;
    }
  }

  /**
   * Convert an unpublished scratchpad into a real GitHub repo + initial commit
   * + push, and flip the manifest's `published` flag.
   *
   * NOTE: project-access pre-flight (`posthogClient.getProject(...)`) and the
   * subsequent project rename live in the renderer (`usePublishScratchpad`).
   * The service trusts that the caller already validated access. The manifest
   * patch happens here so the on-disk state stays consistent with the GitHub
   * remote even if the post-publish rename fails.
   *
   * Failure handling per the plan:
   * - Failure before `git remote add origin` (no GitHub remote created): clean
   *   up local `.git` so the user can retry from scratch.
   * - Failure after the GitHub repo is created but before the manifest patch
   *   succeeds: leave the GitHub remote intact and surface a `push_failed`
   *   error. We deliberately do NOT auto-delete remote GitHub repos.
   */
  public async publish(
    taskId: string,
    options: { repoName: string; visibility?: PublishVisibility },
  ): Promise<PublishResult> {
    const visibility: PublishVisibility = options.visibility ?? "private";
    const scratchpadPath = await this.getScratchpadPath(taskId);
    if (!scratchpadPath) {
      return {
        success: false,
        code: "git_error",
        message: `No scratchpad found for taskId "${taskId}"`,
      };
    }

    // 1. Already-published guard.
    const manifest = await this.readManifestFromPath(scratchpadPath);
    if (manifest.published) {
      return {
        success: false,
        code: "already_published",
        message: "Already published",
      };
    }

    // 3. Secret-leakage guard. Ensure a `.gitignore` exists, then walk the
    // tree and reject if any non-ignored file looks dangerous.
    await this.ensureGitignore(scratchpadPath);
    const offending = await this.findOffendingFiles(scratchpadPath);
    if (offending.length > 0) {
      return {
        success: false,
        code: "secret_leakage",
        message: `Refusing to publish: ${offending.length} file(s) look like secrets or are too large.`,
        paths: offending,
      };
    }

    // 4. git init + initial commit. `init.defaultBranch=main` so we don't have
    // to rename the branch after the fact.
    let gitInitialized = false;
    try {
      await this.runGit(scratchpadPath, [
        "-c",
        "init.defaultBranch=main",
        "init",
      ]);
      gitInitialized = true;
      // Make sure we land on `main` even on git versions that ignore the -c.
      await this.runGit(scratchpadPath, [
        "symbolic-ref",
        "HEAD",
        "refs/heads/main",
      ]).catch(() => undefined);
      await this.runGit(scratchpadPath, ["add", "."]);
      await this.runGit(scratchpadPath, ["commit", "-m", "Initial commit"]);
    } catch (error) {
      publishLog.warn("git init/commit failed", { taskId, error });
      if (gitInitialized) {
        await this.cleanupLocalGit(scratchpadPath);
      }
      return {
        success: false,
        code: "git_error",
        message:
          error instanceof Error ? error.message : "Failed to initialize git",
      };
    }

    // 6. POST /user/repos.
    const token = await this.getGhAuthToken();
    if (!token) {
      await this.cleanupLocalGit(scratchpadPath);
      return {
        success: false,
        code: "no_gh_token",
        message:
          "No GitHub auth token available. Run `gh auth login` and retry.",
      };
    }

    const repoNameSanitized = sanitizeRepoName(options.repoName);
    if (!repoNameSanitized || !REPO_NAME_RE.test(repoNameSanitized)) {
      await this.cleanupLocalGit(scratchpadPath);
      return {
        success: false,
        code: "github_error",
        message: `Invalid repo name: ${options.repoName}`,
      };
    }

    let repoFullName: string;
    let remoteUrl: string;
    try {
      const response = await this.fetchImpl(
        "https://api.github.com/user/repos",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: repoNameSanitized,
            private: visibility === "private",
            description: "Scaffolded with PostHog Code",
          }),
        },
      );

      if (response.status === 422) {
        await this.cleanupLocalGit(scratchpadPath);
        return {
          success: false,
          code: "repo_name_conflict",
          message: `A repository named "${repoNameSanitized}" already exists on your account. Pick a different name and retry.`,
        };
      }

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        await this.cleanupLocalGit(scratchpadPath);
        return {
          success: false,
          code: "github_error",
          message: `GitHub API returned ${response.status}: ${body.slice(0, 200)}`,
        };
      }

      const data = (await response.json()) as {
        ssh_url?: string;
        clone_url?: string;
        full_name?: string;
      };
      remoteUrl = data.ssh_url || data.clone_url || "";
      repoFullName = data.full_name ?? repoNameSanitized;
      if (!remoteUrl) {
        await this.cleanupLocalGit(scratchpadPath);
        return {
          success: false,
          code: "github_error",
          message: "GitHub did not return a remote URL.",
        };
      }
    } catch (error) {
      publishLog.warn("Failed to call GitHub API", { taskId, error });
      await this.cleanupLocalGit(scratchpadPath);
      return {
        success: false,
        code: "github_error",
        message:
          error instanceof Error ? error.message : "Failed to call GitHub",
      };
    }

    // 7. git remote add origin + git push -u origin main. From here on, the
    // remote exists and we deliberately leave it intact on failure.
    try {
      await this.runGit(scratchpadPath, ["remote", "add", "origin", remoteUrl]);
      await this.runGit(scratchpadPath, ["push", "-u", "origin", "main"]);
    } catch (error) {
      publishLog.error("Push failed after creating GitHub repo", {
        taskId,
        repoFullName,
        error,
      });
      return {
        success: false,
        code: "push_failed",
        message: `Created ${repoFullName} on GitHub, but the push failed: ${
          error instanceof Error ? error.message : String(error)
        }. Resolve the issue manually and push from a terminal.`,
      };
    }

    // 9. Patch the manifest atomically so disk state matches GitHub state.
    const updated = await this.writeManifest(taskId, {
      published: true,
      publishedAt: new Date().toISOString(),
      githubRemote: remoteUrl,
    });

    // 10. Emit Published.
    this.emit(ScratchpadServiceEvent.Published, {
      taskId,
      manifest: updated,
      repoFullName,
      githubRemote: remoteUrl,
    });

    return {
      success: true,
      manifest: updated,
      repoFullName,
      githubRemote: remoteUrl,
    };
  }

  private async ensureGitignore(scratchpadPath: string): Promise<void> {
    const gitignorePath = path.join(scratchpadPath, ".gitignore");
    try {
      await fsPromises.writeFile(gitignorePath, DEFAULT_GITIGNORE, {
        flag: "wx",
        encoding: "utf8",
      });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
  }

  /**
   * Returns relative paths that would be tracked by `git add .` and either:
   *  - have a basename matching one of the secret patterns, OR
   *  - exceed `MAX_FILE_BYTES`.
   *
   * Uses `git ls-files --others --cached --exclude-standard -z` so gitignore
   * semantics (negation, nested gitignores, global gitignore) are handled
   * correctly without re-implementing them. The scratchpad is always a git
   * repo by the time we get here (`scaffoldEmpty` runs `git init`), and
   * `--others` covers the unstaged-but-not-yet-tracked common case at
   * publish time.
   */
  private async findOffendingFiles(scratchpadPath: string): Promise<string[]> {
    const stdout = await this.gitListTrackable(scratchpadPath);
    const candidates = stdout
      .split("\0")
      .filter((p) => p.length > 0 && !p.startsWith(".git/"));

    const offending: string[] = [];
    await Promise.all(
      candidates.map(async (rel) => {
        const basename = rel.split("/").pop() ?? rel;
        if (SECRET_FILENAME_PATTERNS.some((re) => re.test(basename))) {
          offending.push(rel);
          return;
        }
        try {
          const stat = await fsPromises.stat(path.join(scratchpadPath, rel));
          if (stat.size > MAX_FILE_BYTES) offending.push(rel);
        } catch {
          // file may have been removed mid-check; ignore
        }
      }),
    );
    return offending;
  }

  /**
   * Override-point for tests; production runs git directly.
   * Returns NUL-separated paths from `git ls-files`.
   */
  protected async gitListTrackable(cwd: string): Promise<string> {
    const { stdout } = await execFileAsync(
      "git",
      ["ls-files", "--others", "--cached", "--exclude-standard", "-z"],
      { cwd, maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  }

  private async cleanupLocalGit(scratchpadPath: string): Promise<void> {
    try {
      await fsPromises.rm(path.join(scratchpadPath, ".git"), {
        recursive: true,
        force: true,
      });
    } catch (error) {
      publishLog.warn("Failed to clean up local .git", {
        scratchpadPath,
        error,
      });
    }
  }

  /**
   * Removes the scratchpad's task directory tree (`<base>/<taskId>`) and emits
   * `Deleted`. No-op if the directory does not exist.
   */
  public async delete(taskId: string): Promise<void> {
    const taskDir = this.getTaskDir(taskId);
    log.info("Deleting scratchpad", { taskId, taskDir });
    try {
      await fsPromises.rm(taskDir, { recursive: true, force: true });
    } catch (error) {
      log.warn("Failed to remove scratchpad directory", { taskId, error });
      throw error;
    }
    this.emit(ScratchpadServiceEvent.Deleted, { taskId });
  }

  /**
   * Lists all scratchpads on disk. Entries with missing or malformed manifests
   * are skipped (and logged) so a single bad manifest doesn't poison the list.
   */
  public async list(): Promise<ScratchpadListEntry[]> {
    const baseDir = this.getBaseDir();
    let taskDirents: fs.Dirent[];
    try {
      taskDirents = await fsPromises.readdir(baseDir, { withFileTypes: true });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      throw error;
    }

    const results = await Promise.all(
      taskDirents
        .filter((d) => d.isDirectory())
        .map(async (taskDirent) => {
          const taskId = taskDirent.name;
          const taskDir = path.join(baseDir, taskId);
          let inner: fs.Dirent[];
          try {
            inner = await fsPromises.readdir(taskDir, { withFileTypes: true });
          } catch {
            return null;
          }
          const scratchpadDir = inner.find((d) => d.isDirectory());
          if (!scratchpadDir) return null;

          const scratchpadPath = path.join(taskDir, scratchpadDir.name);
          try {
            const manifest = await this.readManifestFromPath(scratchpadPath);
            return {
              taskId,
              name: scratchpadDir.name,
              manifest,
            } satisfies ScratchpadListEntry;
          } catch (error) {
            log.warn("Skipping scratchpad with bad manifest", {
              taskId,
              name: scratchpadDir.name,
              error,
            });
            return null;
          }
        }),
    );
    return results.filter((e): e is ScratchpadListEntry => e !== null);
  }

  /**
   * Append `fn` to the per-taskId promise chain so concurrent calls run
   * sequentially without losing updates.
   */
  private runSerialized<T>(taskId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.writeChains.get(taskId) ?? Promise.resolve();
    const next = previous.then(fn, fn);
    // Suppress the chain-tracking promise so a rejected write doesn't surface
    // as an unhandled rejection; callers still see the rejection via `next`.
    const tracked: Promise<unknown> = next
      .catch(() => undefined)
      .finally(() => {
        if (this.writeChains.get(taskId) === tracked) {
          this.writeChains.delete(taskId);
        }
      });
    this.writeChains.set(taskId, tracked);
    return next;
  }
}
