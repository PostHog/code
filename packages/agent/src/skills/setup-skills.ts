import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import type { SagaLogger } from "@posthog/shared";
import { SkillsManager } from "./skills-manager.js";

export interface SetupSkillsConfig {
  bundledPluginDir: string;
  runtimePluginDir: string;
  runtimeSkillsDir: string;
  codexSkillsDir: string;
  isDevBuild: boolean;
  skillsZipUrl?: string;
  contextMillZipUrl?: string;
  downloadFile: (url: string, destPath: string) => Promise<void>;
  logger: SagaLogger;
  onError?: (error: unknown) => void;
}

async function copyBundledPlugin(
  bundledDir: string,
  runtimeDir: string,
  logger: SagaLogger,
  onError?: (error: unknown) => void,
): Promise<void> {
  try {
    if (!existsSync(bundledDir)) {
      logger.warn("Bundled plugin dir not found", { path: bundledDir });
      return;
    }
    await rm(runtimeDir, { recursive: true, force: true });
    await cp(bundledDir, runtimeDir, { recursive: true });
    logger.info("Bundled plugin copied to runtime dir");
  } catch (err) {
    logger.warn("Failed to copy bundled plugin", {
      error: err instanceof Error ? err.message : String(err),
    });
    onError?.(err);
  }
}

export async function setupSkills(
  config: SetupSkillsConfig,
): Promise<() => void> {
  const {
    bundledPluginDir,
    runtimePluginDir,
    runtimeSkillsDir,
    codexSkillsDir,
    isDevBuild,
    logger,
    onError,
  } = config;

  if (!existsSync(join(runtimePluginDir, "plugin.json"))) {
    await copyBundledPlugin(
      bundledPluginDir,
      runtimePluginDir,
      logger,
      onError,
    );
  }

  const pluginPath =
    isDevBuild || !existsSync(join(runtimePluginDir, "plugin.json"))
      ? bundledPluginDir
      : runtimePluginDir;

  const manager = new SkillsManager({
    runtimeSkillsDir,
    runtimePluginDir,
    pluginPath,
    codexSkillsDir,
    skillsZipUrl: config.skillsZipUrl,
    contextMillZipUrl: config.contextMillZipUrl,
    downloadFile: config.downloadFile,
    logger,
    onError,
  });

  await manager.overlaySkills();
  await manager.syncCodex();
  manager.startPeriodicUpdates();
  manager.updateSkills().catch((err) => {
    logger.error("Initial skills update failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return () => manager.stopPeriodicUpdates();
}
