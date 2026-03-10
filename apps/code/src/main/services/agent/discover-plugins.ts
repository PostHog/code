import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { SdkPluginConfig } from "@anthropic-ai/claude-agent-sdk";
import { logger } from "../../utils/logger.js";

const log = logger.scope("discover-plugins");

interface DiscoverPluginsOptions {
  userDataDir: string;
  repoPath?: string;
}

interface InstalledPluginEntry {
  scope: string;
  installPath: string;
  version: string;
}

interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, InstalledPluginEntry[]>;
}

/**
 * Discovers global skills, marketplace plugins and repo skills,
 * returning them as SdkPluginConfig entries to pass to the Claude Agent SDK.
 */
export async function discoverExternalPlugins(
  options: DiscoverPluginsOptions,
): Promise<SdkPluginConfig[]> {
  log.info("discoverExternalPlugins called", {
    userDataDir: options.userDataDir,
    repoPath: options.repoPath,
  });

  const results: SdkPluginConfig[] = [];

  const [globalSkills, marketplacePlugins, repoSkills] = await Promise.all([
    discoverGlobalSkills(options.userDataDir),
    discoverMarketplacePlugins(),
    options.repoPath
      ? discoverRepoSkills(options.userDataDir, options.repoPath)
      : Promise.resolve([]),
  ]);

  results.push(...globalSkills, ...marketplacePlugins, ...repoSkills);
  log.info("discoverExternalPlugins result", {
    total: results.length,
    plugins: results.map((p) => p.path),
  });
  return results;
}

/**
 * Scans ~/.claude/skills/ for bare skill directories (containing SKILL.md)
 * and creates a synthetic plugin wrapper so the SDK can load them.
 */
async function discoverGlobalSkills(
  userDataDir: string,
): Promise<SdkPluginConfig[]> {
  const claudeDir = path.join(os.homedir(), ".claude");
  const skillsDir = path.join(claudeDir, "skills");

  log.info("discoverGlobalSkills", { claudeDir, skillsDir });

  return buildSyntheticPlugin(
    skillsDir,
    path.join(userDataDir, "plugins", "global-skills"),
    "global-skills",
    "User global Claude skills",
  );
}

/**
 * Reads ~/.claude/plugins/installed_plugins.json and returns each
 * installed marketplace plugin as a plugin config entry.
 */
async function discoverMarketplacePlugins(): Promise<SdkPluginConfig[]> {
  const claudeDir = path.join(os.homedir(), ".claude");
  const installedPath = path.join(
    claudeDir,
    "plugins",
    "installed_plugins.json",
  );

  log.info("discoverMarketplacePlugins", { installedPath });

  try {
    const content = await fs.promises.readFile(installedPath, "utf-8");
    const data = JSON.parse(content) as InstalledPluginsFile;

    if (!data.plugins || typeof data.plugins !== "object") {
      log.info("discoverMarketplacePlugins: no plugins object in file");
      return [];
    }

    const configs: SdkPluginConfig[] = [];
    for (const entries of Object.values(data.plugins)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        const exists = entry.installPath
          ? fs.existsSync(entry.installPath)
          : false;
        log.info("discoverMarketplacePlugins entry", {
          installPath: entry.installPath,
          exists,
        });
        if (exists) {
          configs.push({ type: "local", path: entry.installPath });
        }
      }
    }
    return configs;
  } catch (err) {
    log.warn("discoverMarketplacePlugins failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Scans <repoPath>/.claude/skills/ for bare skill directories
 * and creates a synthetic plugin wrapper.
 */
async function discoverRepoSkills(
  userDataDir: string,
  repoPath: string,
): Promise<SdkPluginConfig[]> {
  const skillsDir = path.join(repoPath, ".claude", "skills");
  const hash = crypto
    .createHash("md5")
    .update(repoPath)
    .digest("hex")
    .slice(0, 8);

  return buildSyntheticPlugin(
    skillsDir,
    path.join(userDataDir, "plugins", `repo-skills-${hash}`),
    `repo-skills-${hash}`,
    `Repo skills for ${path.basename(repoPath)}`,
  );
}

/**
 * Given a directory of bare skills (dirs with SKILL.md), creates a synthetic
 * plugin directory with plugin.json and symlinks into skills/.
 */
async function buildSyntheticPlugin(
  sourceSkillsDir: string,
  pluginDir: string,
  name: string,
  description: string,
): Promise<SdkPluginConfig[]> {
  log.info("buildSyntheticPlugin start", { sourceSkillsDir, pluginDir, name });

  try {
    const sourceExists = fs.existsSync(sourceSkillsDir);
    log.info("buildSyntheticPlugin sourceExists", { sourceExists });
    if (!sourceExists) {
      return [];
    }

    const entries = await fs.promises.readdir(sourceSkillsDir, {
      withFileTypes: true,
    });

    const skillDirs: string[] = [];
    for (const entry of entries) {
      const isDir = entry.isDirectory();
      const isSymlink = entry.isSymbolicLink();
      if (!isDir && !isSymlink) continue;

      const entryPath = path.join(sourceSkillsDir, entry.name);
      const skillMdPath = path.join(entryPath, "SKILL.md");
      const hasSkillMd = fs.existsSync(skillMdPath);
      log.info("buildSyntheticPlugin entry", {
        name: entry.name,
        isDir,
        isSymlink,
        skillMdPath,
        hasSkillMd,
      });
      if (hasSkillMd) {
        skillDirs.push(entry.name);
      }
    }

    log.info("buildSyntheticPlugin skillDirs", { skillDirs });

    if (skillDirs.length === 0) {
      return [];
    }

    const syntheticSkillsDir = path.join(pluginDir, "skills");
    await fs.promises.mkdir(syntheticSkillsDir, { recursive: true });

    await fs.promises.writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({ name, description, version: "1.0.0" }),
    );

    // Clean out old symlinks
    try {
      const existing = await fs.promises.readdir(syntheticSkillsDir);
      await Promise.all(
        existing.map((e) =>
          fs.promises.rm(path.join(syntheticSkillsDir, e), {
            recursive: true,
            force: true,
          }),
        ),
      );
    } catch {
      // ignore
    }

    // Create symlinks for each skill
    await Promise.all(
      skillDirs.map(async (skillName) => {
        const src = path.join(sourceSkillsDir, skillName);
        const dest = path.join(syntheticSkillsDir, skillName);
        try {
          const realSrc = await fs.promises.realpath(src);
          log.info("buildSyntheticPlugin symlinking", { realSrc, dest });
          await fs.promises.symlink(realSrc, dest);
        } catch (err) {
          log.warn("Failed to symlink skill", {
            skillName,
            src,
            dest,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    log.info("Built synthetic plugin", { name, pluginDir, skills: skillDirs });
    return [{ type: "local", path: pluginDir }];
  } catch (err) {
    log.warn("Failed to discover skills", {
      source: sourceSkillsDir,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
