import { existsSync } from "node:fs";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { IBundledResources } from "@posthog/platform/bundled-resources";
import type { IStoragePaths } from "@posthog/platform/storage-paths";
import { inject, injectable, postConstruct, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { isDevBuild } from "../../utils/env";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import { captureException } from "../posthog-analytics";
import {
  overlayDownloadedSkills,
  syncCodexSkills,
  UpdateSkillsSaga,
} from "./update-skills-saga";

const log = logger.scope("posthog-plugin");

const SKILLS_ZIP_URL = process.env.SKILLS_ZIP_URL ?? "";
if (!SKILLS_ZIP_URL) {
  log.warn("SKILLS_ZIP_URL environment variable is not set");
}
const CONTEXT_MILL_ZIP_URL = process.env.CONTEXT_MILL_ZIP_URL ?? "";
const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const CODEX_SKILLS_DIR = join(homedir(), ".agents", "skills");

interface PosthogPluginEvents {
  skillsUpdated: true;
}

@injectable()
export class PosthogPluginService extends TypedEventEmitter<PosthogPluginEvents> {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastCheckAt = 0;
  private updating = false;

  constructor(
    @inject(MAIN_TOKENS.StoragePaths)
    private readonly storagePaths: IStoragePaths,
    @inject(MAIN_TOKENS.BundledResources)
    private readonly bundledResources: IBundledResources,
  ) {
    super();
  }

  /** Runtime plugin dir under userData */
  private get runtimePluginDir(): string {
    return join(this.storagePaths.appDataPath, "plugins", "posthog");
  }

  /** Runtime skills cache (downloaded zips extracted here) */
  private get runtimeSkillsDir(): string {
    return join(this.storagePaths.appDataPath, "skills");
  }

  /** Bundled plugin path inside the .vite build output */
  private get bundledPluginDir(): string {
    return this.bundledResources.resolve(".vite/build/plugins/posthog");
  }

  @postConstruct()
  init(): void {
    this.initialize().catch((err) => {
      log.error("Skills initialization failed", err);
      captureException(err, {
        source: "posthog-plugin",
        operation: "initialize",
      });
    });
  }

  private async initialize(): Promise<void> {
    // On first run (or after app update), copy the entire bundled plugin to the runtime dir.
    // On subsequent starts the runtime dir already exists — just overlay any cached downloaded skills.
    if (!existsSync(join(this.runtimePluginDir, "plugin.json"))) {
      await this.copyBundledPlugin();
    }

    // Overlay any previously-downloaded skills on top of the runtime plugin
    await overlayDownloadedSkills(this.runtimeSkillsDir, this.runtimePluginDir);

    await syncCodexSkills(this.getPluginPath(), CODEX_SKILLS_DIR);

    // Start periodic updates
    this.intervalId = setInterval(() => {
      this.updateSkills().catch((err) => {
        log.warn("Periodic skills update failed", err);
      });
    }, UPDATE_INTERVAL_MS);

    // Kick off first download
    await this.updateSkills();
  }

  /**
   * Returns the path to the plugin directory that should be used for agent sessions.
   *
   * - In dev mode: Vite already merged shipped + remote + local-dev skills, so use bundled path.
   * - In prod: use the runtime plugin dir (with downloaded updates).
   * - Fallback: bundled plugin path.
   */
  getPluginPath(): string {
    if (isDevBuild()) {
      return this.bundledPluginDir;
    }

    if (existsSync(join(this.runtimePluginDir, "plugin.json"))) {
      return this.runtimePluginDir;
    }

    return this.bundledPluginDir;
  }

  async updateSkills(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCheckAt < UPDATE_INTERVAL_MS) {
      return;
    }

    if (this.updating) {
      return;
    }

    this.updating = true;
    this.lastCheckAt = now;

    const tempDir = join(tmpdir(), `posthog-code-skills-${Date.now()}`);

    try {
      await mkdir(tempDir, { recursive: true });

      const saga = new UpdateSkillsSaga(log);
      const result = await saga.run({
        runtimeSkillsDir: this.runtimeSkillsDir,
        runtimePluginDir: this.runtimePluginDir,
        pluginPath: this.getPluginPath(),
        codexSkillsDir: CODEX_SKILLS_DIR,
        tempDir,
        skillsZipUrl: SKILLS_ZIP_URL,
        contextMillZipUrl: CONTEXT_MILL_ZIP_URL,
        downloadFile: (url, destPath) => this.downloadFile(url, destPath),
      });

      if (result.success) {
        this.emit("skillsUpdated", true);
      } else {
        log.warn("Skills update failed", {
          error: result.error,
          failedStep: result.failedStep,
        });
        captureException(new Error(result.error), {
          source: "posthog-plugin",
          operation: "updateSkills",
          failedStep: result.failedStep,
        });
      }
    } catch (err) {
      log.warn("Failed to update skills, will retry next interval", err);
      captureException(err, {
        source: "posthog-plugin",
        operation: "updateSkills",
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      this.updating = false;
    }
  }

  /**
   * Copies the entire bundled plugin directory to the runtime location.
   * Called once on first run or after an app update.
   */
  private async copyBundledPlugin(): Promise<void> {
    try {
      if (!existsSync(this.bundledPluginDir)) {
        log.warn("Bundled plugin dir not found", {
          path: this.bundledPluginDir,
        });
        return;
      }
      await rm(this.runtimePluginDir, { recursive: true, force: true });
      await cp(this.bundledPluginDir, this.runtimePluginDir, {
        recursive: true,
      });
    } catch (err) {
      log.warn("Failed to copy bundled plugin", err);
      captureException(err, {
        source: "posthog-plugin",
        operation: "copyBundledPlugin",
      });
    }
  }

  private async downloadFile(url: string, destPath: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}`,
      );
    }

    const buffer = await response.arrayBuffer();
    await writeFile(destPath, Buffer.from(buffer));
  }

  @preDestroy()
  cleanup(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
