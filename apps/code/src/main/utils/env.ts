import { mkdirSync } from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * Whether this is a development build (running via electron-forge start).
 * Use this for dev/prod feature gates. Use `app.isPackaged` directly only
 * when you need to know about ASAR packaging (e.g. resolving .unpacked paths).
 */
export function isDevBuild(): boolean {
  return !app.isPackaged;
}

export function ensureClaudeConfigDir(): void {
  const existing = process.env.CLAUDE_CONFIG_DIR;
  if (existing) return;

  const userDataDir = app.getPath("userData");
  const claudeDir = path.join(userDataDir, "claude");

  mkdirSync(claudeDir, { recursive: true });
  process.env.CLAUDE_CONFIG_DIR = claudeDir;
}
