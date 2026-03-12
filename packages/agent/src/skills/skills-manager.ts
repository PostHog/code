import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SagaLogger } from "@posthog/shared";
import {
  CONTEXT_MILL_ZIP_URL,
  DEFAULT_UPDATE_INTERVAL_MS,
  SKILLS_ZIP_URL,
} from "./constants.js";
import {
  overlayDownloadedSkills,
  syncCodexSkills,
  UpdateSkillsSaga,
} from "./update-skills-saga.js";

export interface SkillsManagerConfig {
  runtimeSkillsDir: string;
  runtimePluginDir: string;
  pluginPath: string;
  codexSkillsDir: string;
  skillsZipUrl?: string;
  contextMillZipUrl?: string;
  updateIntervalMs?: number;
  downloadFile: (url: string, destPath: string) => Promise<void>;
  logger: SagaLogger;
  onUpdated?: () => void;
  onError?: (error: unknown) => void;
}

export class SkillsManager {
  private readonly config: SkillsManagerConfig;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private lastCheckAt = 0;
  private updating = false;

  constructor(config: SkillsManagerConfig) {
    this.config = config;
  }

  async updateSkills(): Promise<boolean> {
    const intervalMs =
      this.config.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
    const now = Date.now();
    if (now - this.lastCheckAt < intervalMs) {
      return false;
    }

    if (this.updating) {
      return false;
    }

    this.updating = true;
    this.lastCheckAt = now;

    const tempDir = join(tmpdir(), `posthog-skills-${Date.now()}`);

    try {
      await mkdir(tempDir, { recursive: true });

      const saga = new UpdateSkillsSaga(this.config.logger);
      const result = await saga.run({
        runtimeSkillsDir: this.config.runtimeSkillsDir,
        runtimePluginDir: this.config.runtimePluginDir,
        pluginPath: this.config.pluginPath,
        codexSkillsDir: this.config.codexSkillsDir,
        tempDir,
        skillsZipUrl: this.config.skillsZipUrl ?? SKILLS_ZIP_URL,
        contextMillZipUrl:
          this.config.contextMillZipUrl ?? CONTEXT_MILL_ZIP_URL,
        downloadFile: this.config.downloadFile,
      });

      if (result.success) {
        this.config.logger.info("Skills updated successfully");
        this.config.onUpdated?.();
        return true;
      }

      this.config.logger.warn("Skills update failed", {
        error: result.error,
        failedStep: result.failedStep,
      });
      this.config.onError?.(new Error(result.error));
      return false;
    } catch (err) {
      this.config.logger.warn(
        "Failed to update skills, will retry next interval",
        {
          error: err instanceof Error ? err.message : String(err),
        },
      );
      this.config.onError?.(err);
      return false;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
      this.updating = false;
    }
  }

  startPeriodicUpdates(): void {
    const intervalMs =
      this.config.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS;
    this.intervalId = setInterval(() => {
      this.updateSkills().catch((err) => {
        this.config.logger.warn("Periodic skills update failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, intervalMs);
  }

  stopPeriodicUpdates(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async overlaySkills(): Promise<void> {
    await overlayDownloadedSkills(
      this.config.runtimeSkillsDir,
      this.config.runtimePluginDir,
    );
  }

  async syncCodex(): Promise<void> {
    await syncCodexSkills(this.config.pluginPath, this.config.codexSkillsDir);
  }
}
