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

export async function discoverExternalPlugins(
  options: DiscoverPluginsOptions,
): Promise<SdkPluginConfig[]> {
  const [globalSkills, marketplacePlugins, repoSkills] = await Promise.all([
    discoverUserSkills(options.userDataDir),
    discoverMarketplacePlugins(),
    options.repoPath
      ? discoverRepoSkills(options.userDataDir, options.repoPath)
      : Promise.resolve([]),
  ]);

  return [...globalSkills, ...marketplacePlugins, ...repoSkills];
}

async function discoverUserSkills(
  userDataDir: string,
): Promise<SdkPluginConfig[]> {
  return buildSyntheticPlugin(
    path.join(os.homedir(), ".claude", "skills"),
    path.join(userDataDir, "plugins", "user-skills"),
    "user-skills",
    "User Claude skills",
  );
}

async function discoverMarketplacePlugins(): Promise<SdkPluginConfig[]> {
  const installedPath = path.join(
    os.homedir(),
    ".claude",
    "plugins",
    "installed_plugins.json",
  );

  try {
    const content = await fs.promises.readFile(installedPath, "utf-8");
    const data = JSON.parse(content) as InstalledPluginsFile;

    if (!data.plugins || typeof data.plugins !== "object") {
      return [];
    }

    const configs: SdkPluginConfig[] = [];
    for (const entries of Object.values(data.plugins)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (entry.installPath && fs.existsSync(entry.installPath)) {
          configs.push({ type: "local", path: entry.installPath });
        }
      }
    }
    return configs;
  } catch {
    return [];
  }
}

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

async function buildSyntheticPlugin(
  sourceSkillsDir: string,
  pluginDir: string,
  name: string,
  description: string,
): Promise<SdkPluginConfig[]> {
  try {
    if (!fs.existsSync(sourceSkillsDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(sourceSkillsDir, {
      withFileTypes: true,
    });

    const skillDirs = entries
      .filter(
        (e) =>
          (e.isDirectory() || e.isSymbolicLink()) &&
          fs.existsSync(path.join(sourceSkillsDir, e.name, "SKILL.md")),
      )
      .map((e) => e.name);

    if (skillDirs.length === 0) {
      return [];
    }

    const syntheticSkillsDir = path.join(pluginDir, "skills");
    await fs.promises.mkdir(syntheticSkillsDir, { recursive: true });

    await fs.promises.writeFile(
      path.join(pluginDir, "plugin.json"),
      JSON.stringify({ name, description, version: "1.0.0" }),
    );

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

    await Promise.all(
      skillDirs.map(async (skillName) => {
        const src = path.join(sourceSkillsDir, skillName);
        const dest = path.join(syntheticSkillsDir, skillName);
        try {
          const realSrc = await fs.promises.realpath(src);
          await fs.promises.symlink(realSrc, dest);
        } catch (err) {
          log.warn("Failed to symlink skill", {
            skillName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );

    return [{ type: "local", path: pluginDir }];
  } catch (err) {
    log.warn("Failed to discover skills", {
      source: sourceSkillsDir,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
