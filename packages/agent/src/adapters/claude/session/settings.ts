import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { minimatch } from "minimatch";

const ACP_TOOL_NAME_PREFIX = "mcp__acp__";

const acpToolNames = {
  read: `${ACP_TOOL_NAME_PREFIX}Read`,
  edit: `${ACP_TOOL_NAME_PREFIX}Edit`,
  write: `${ACP_TOOL_NAME_PREFIX}Write`,
  bash: `${ACP_TOOL_NAME_PREFIX}Bash`,
};

const SHELL_OPERATORS = ["&&", "||", ";", "|", "$(", "`", "\n"];

function containsShellOperator(str: string): boolean {
  return SHELL_OPERATORS.some((op) => str.includes(op));
}

const FILE_EDITING_TOOLS = [acpToolNames.edit, acpToolNames.write];

const FILE_READING_TOOLS = [acpToolNames.read];

const TOOL_ARG_ACCESSORS: Record<
  string,
  (input: Record<string, unknown>) => string | undefined
> = {
  [acpToolNames.read]: (input) => input?.file_path as string | undefined,
  [acpToolNames.edit]: (input) => input?.file_path as string | undefined,
  [acpToolNames.write]: (input) => input?.file_path as string | undefined,
  [acpToolNames.bash]: (input) => input?.command as string | undefined,
};

interface ParsedRule {
  toolName: string;
  argument?: string;
  isWildcard?: boolean;
}

function parseRule(rule: string): ParsedRule {
  const match = rule.match(/^(\w+)(?:\((.+)\))?$/);
  if (!match) {
    return { toolName: rule };
  }
  const toolName = match[1] ?? rule;
  const argument = match[2];
  if (argument?.endsWith(":*")) {
    return {
      toolName,
      argument: argument.slice(0, -2),
      isWildcard: true,
    };
  }
  return { toolName, argument };
}

function normalizePath(filePath: string, cwd: string): string {
  let resolved = filePath;
  if (resolved.startsWith("~/")) {
    resolved = path.join(os.homedir(), resolved.slice(2));
  } else if (resolved.startsWith("./")) {
    resolved = path.join(cwd, resolved.slice(2));
  } else if (!path.isAbsolute(resolved)) {
    resolved = path.join(cwd, resolved);
  }
  return path.normalize(resolved).replace(/\\/g, "/");
}

function matchesGlob(pattern: string, filePath: string, cwd: string): boolean {
  const normalizedPattern = normalizePath(pattern, cwd);
  const normalizedPath = normalizePath(filePath, cwd);
  return minimatch(normalizedPath, normalizedPattern, {
    dot: true,
    matchBase: false,
    nocase: process.platform === "win32",
  });
}

function matchesRule(
  rule: ParsedRule,
  toolName: string,
  toolInput: unknown,
  cwd: string,
): boolean {
  const ruleAppliesToTool =
    (rule.toolName === "Bash" && toolName === acpToolNames.bash) ||
    (rule.toolName === "Edit" && FILE_EDITING_TOOLS.includes(toolName)) ||
    (rule.toolName === "Read" && FILE_READING_TOOLS.includes(toolName));

  if (!ruleAppliesToTool) {
    return false;
  }

  if (!rule.argument) {
    return true;
  }

  const argAccessor = TOOL_ARG_ACCESSORS[toolName];
  if (!argAccessor) {
    return true;
  }

  const actualArg = argAccessor(toolInput as Record<string, unknown>);
  if (!actualArg) {
    return false;
  }

  if (toolName === acpToolNames.bash) {
    if (rule.isWildcard) {
      if (!actualArg.startsWith(rule.argument)) {
        return false;
      }
      const remainder = actualArg.slice(rule.argument.length);
      if (containsShellOperator(remainder)) {
        return false;
      }
      return true;
    }
    return actualArg === rule.argument;
  }

  return matchesGlob(rule.argument, actualArg, cwd);
}

async function loadSettingsFile(
  filePath: string | undefined,
): Promise<ClaudeCodeSettings> {
  if (!filePath) {
    return {};
  }
  try {
    const content = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(content) as ClaudeCodeSettings;
  } catch {
    return {};
  }
}

export interface PermissionSettings {
  allow?: string[];
  deny?: string[];
  ask?: string[];
  additionalDirectories?: string[];
  defaultMode?: string;
}

export interface ClaudeCodeSettings {
  permissions?: PermissionSettings;
  env?: Record<string, string>;
  model?: string;
}

export type PermissionDecision = "allow" | "deny" | "ask";

export interface PermissionCheckResult {
  decision: PermissionDecision;
  rule?: string;
  source?: "allow" | "deny" | "ask";
}

export function getManagedSettingsPath(): string {
  switch (process.platform) {
    case "darwin":
      return "/Library/Application Support/ClaudeCode/managed-settings.json";
    case "linux":
      return "/etc/claude-code/managed-settings.json";
    case "win32":
      return "C:\\Program Files\\ClaudeCode\\managed-settings.json";
    default:
      return "/etc/claude-code/managed-settings.json";
  }
}
export class SettingsManager {
  private cwd: string;
  private userSettings: ClaudeCodeSettings = {};
  private projectSettings: ClaudeCodeSettings = {};
  private localSettings: ClaudeCodeSettings = {};
  private enterpriseSettings: ClaudeCodeSettings = {};
  private mergedSettings: ClaudeCodeSettings = {};
  private watchers: fs.FSWatcher[] = [];
  private initialized = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // logger: Logger, options?: SettingsManagerOptions
  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.loadAllSettings();
    this.initialized = true;
  }

  private getUserSettingsPath(): string {
    const configDir =
      process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
    return path.join(configDir, "settings.json");
  }

  private getProjectSettingsPath(): string {
    return path.join(this.cwd, ".claude", "settings.json");
  }

  private getLocalSettingsPath(): string {
    return path.join(this.cwd, ".claude", "settings.local.json");
  }

  private async loadAllSettings(): Promise<void> {
    const [userSettings, projectSettings, localSettings, enterpriseSettings] =
      await Promise.all([
        loadSettingsFile(this.getUserSettingsPath()),
        loadSettingsFile(this.getProjectSettingsPath()),
        loadSettingsFile(this.getLocalSettingsPath()),
        loadSettingsFile(getManagedSettingsPath()),
      ]);
    this.userSettings = userSettings;
    this.projectSettings = projectSettings;
    this.localSettings = localSettings;
    this.enterpriseSettings = enterpriseSettings;
    this.mergeAllSettings();
  }

  private mergeAllSettings(): void {
    const allSettings = [
      this.userSettings,
      this.projectSettings,
      this.localSettings,
      this.enterpriseSettings,
    ];

    const permissions: PermissionSettings = {
      allow: [],
      deny: [],
      ask: [],
    };
    const merged: ClaudeCodeSettings = { permissions };

    for (const settings of allSettings) {
      if (settings.permissions) {
        if (settings.permissions.allow) {
          permissions.allow?.push(...settings.permissions.allow);
        }
        if (settings.permissions.deny) {
          permissions.deny?.push(...settings.permissions.deny);
        }
        if (settings.permissions.ask) {
          permissions.ask?.push(...settings.permissions.ask);
        }
        if (settings.permissions.additionalDirectories) {
          permissions.additionalDirectories = [
            ...(permissions.additionalDirectories || []),
            ...settings.permissions.additionalDirectories,
          ];
        }
        if (settings.permissions.defaultMode) {
          permissions.defaultMode = settings.permissions.defaultMode;
        }
      }
      if (settings.env) {
        merged.env = { ...merged.env, ...settings.env };
      }
      if (settings.model) {
        merged.model = settings.model;
      }
    }

    this.mergedSettings = merged;
  }

  checkPermission(toolName: string, toolInput: unknown): PermissionCheckResult {
    if (!toolName.startsWith(ACP_TOOL_NAME_PREFIX)) {
      return { decision: "ask" };
    }

    const permissions = this.mergedSettings.permissions;
    if (!permissions) {
      return { decision: "ask" };
    }

    for (const rule of permissions.deny || []) {
      const parsed = parseRule(rule);
      if (matchesRule(parsed, toolName, toolInput, this.cwd)) {
        return { decision: "deny", rule, source: "deny" };
      }
    }

    for (const rule of permissions.allow || []) {
      const parsed = parseRule(rule);
      if (matchesRule(parsed, toolName, toolInput, this.cwd)) {
        return { decision: "allow", rule, source: "allow" };
      }
    }

    for (const rule of permissions.ask || []) {
      const parsed = parseRule(rule);
      if (matchesRule(parsed, toolName, toolInput, this.cwd)) {
        return { decision: "ask", rule, source: "ask" };
      }
    }

    return { decision: "ask" };
  }

  getSettings(): ClaudeCodeSettings {
    return this.mergedSettings;
  }

  getCwd(): string {
    return this.cwd;
  }

  async setCwd(cwd: string): Promise<void> {
    if (this.cwd === cwd) {
      return;
    }
    this.dispose();
    this.cwd = cwd;
    this.initialized = false;
    await this.initialize();
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.initialized = false;
  }
}
