import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Codex settings parsed from ~/.codex/config.toml and project-level config.
 *
 * Mirrors the shape of ClaudeCodeSettings so both adapters have a
 * consistent settings interface.
 */
export interface CodexSettings {
  model?: string;
  personality?: string;
  modelReasoningEffort?: string;
  trustLevel?: string;
}

/**
 * SettingsManager for Codex sessions.
 *
 * Reads from ~/.codex/config.toml (user-level) and respects
 * per-project trust configuration. Has the same public interface
 * as Claude's SettingsManager so both can satisfy BaseSession.
 */
export class CodexSettingsManager {
  private cwd: string;
  private settings: CodexSettings = {};
  private initialized = false;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.loadSettings();
    this.initialized = true;
  }

  private getConfigPath(): string {
    return path.join(os.homedir(), ".codex", "config.toml");
  }

  private async loadSettings(): Promise<void> {
    const configPath = this.getConfigPath();
    try {
      const content = await fs.promises.readFile(configPath, "utf-8");
      this.settings = parseCodexToml(content, this.cwd);
    } catch {
      this.settings = {};
    }
  }

  getSettings(): CodexSettings {
    return this.settings;
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
    this.initialized = false;
  }
}

/**
 * Minimal TOML parser for codex config.toml.
 * Handles flat key=value pairs and [projects."path"] sections.
 * Does NOT handle full TOML spec — only what codex config uses.
 */
function parseCodexToml(content: string, cwd: string): CodexSettings {
  const settings: CodexSettings = {};
  let currentSection = "";

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Section header: [projects."/some/path"] or [section]
    const sectionMatch = trimmed.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1] ?? "";
      continue;
    }

    // Key = value
    const kvMatch = trimmed.match(/^(\w+)\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    let value = kvMatch[2]?.trim() ?? "";

    // Strip quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!currentSection) {
      // Top-level keys
      if (key === "model") settings.model = value;
      if (key === "personality") settings.personality = value;
      if (key === "model_reasoning_effort")
        settings.modelReasoningEffort = value;
    } else if (currentSection === `projects."${cwd}"`) {
      // Project-specific keys
      if (key === "trust_level") settings.trustLevel = value;
    }
  }

  return settings;
}
