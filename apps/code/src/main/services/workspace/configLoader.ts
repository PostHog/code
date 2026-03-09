import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../../utils/logger";
import {
  type ArrayConfig,
  type ConfigValidationResult,
  validateConfig,
} from "./configSchema";

const log = logger.scope("workspace:config");

export type ConfigSource = "workspace" | "repo";

export interface LoadConfigResult {
  config: ArrayConfig | null;
  source: ConfigSource | null;
}

export async function loadConfig(
  worktreePath: string,
  worktreeName: string,
): Promise<LoadConfigResult> {
  // Search order (first match wins):
  // 1. .posthog-code/{WORKSPACE_NAME}/posthog-code.json (workspace-specific)
  // 2. .twig/{WORKSPACE_NAME}/twig.json (workspace-specific, legacy)
  // 3. .twig/{WORKSPACE_NAME}/array.json (workspace-specific, legacy)
  // 4. .array/{WORKSPACE_NAME}/array.json (workspace-specific, legacy)
  // 5. {repo-root}/posthog-code.json (repository root)
  // 6. {repo-root}/twig.json (repository root, legacy)
  // 7. {repo-root}/array.json (repository root, legacy)

  const workspaceConfigPaths = [
    path.join(worktreePath, ".posthog-code", worktreeName, "posthog-code.json"),
    path.join(worktreePath, ".twig", worktreeName, "twig.json"),
    path.join(worktreePath, ".twig", worktreeName, "array.json"),
    path.join(worktreePath, ".array", worktreeName, "array.json"),
  ];

  const repoConfigPaths = [
    path.join(worktreePath, "posthog-code.json"),
    path.join(worktreePath, "twig.json"),
    path.join(worktreePath, "array.json"),
  ];

  // Try workspace-specific configs first
  for (const configPath of workspaceConfigPaths) {
    const result = await tryLoadConfig(configPath);
    if (result.config) {
      log.info(`Loaded config from workspace: ${configPath}`);
      return { config: result.config, source: "workspace" };
    }
    if (result.errors) {
      log.warn(`Invalid config at ${configPath}: ${result.errors.join(", ")}`);
      return { config: null, source: null };
    }
  }

  // Try repo root configs
  for (const configPath of repoConfigPaths) {
    const result = await tryLoadConfig(configPath);
    if (result.config) {
      log.info(`Loaded config from repo root: ${configPath}`);
      return { config: result.config, source: "repo" };
    }
    if (result.errors) {
      log.warn(`Invalid config at ${configPath}: ${result.errors.join(", ")}`);
      return { config: null, source: null };
    }
  }

  return { config: null, source: null };
}

interface TryLoadResult {
  config: ArrayConfig | null;
  errors: string[] | null;
}

async function tryLoadConfig(configPath: string): Promise<TryLoadResult> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const data = JSON.parse(content);
    const result: ConfigValidationResult = validateConfig(data);

    if (result.success) {
      return { config: result.config, errors: null };
    }
    return { config: null, errors: result.errors };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist - not an error, just continue searching
      return { config: null, errors: null };
    }
    if (error instanceof SyntaxError) {
      return { config: null, errors: [`Invalid JSON: ${error.message}`] };
    }
    log.error(`Error reading config from ${configPath}:`, error);
    return { config: null, errors: [`Failed to read file: ${String(error)}`] };
  }
}

export function normalizeScripts(
  scripts: string | string[] | undefined,
): string[] {
  if (!scripts) return [];
  return Array.isArray(scripts) ? scripts : [scripts];
}
