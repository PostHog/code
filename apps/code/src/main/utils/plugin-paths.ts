import fs from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { isDevBuild } from "./env.js";

export function bundledPluginDir(): string {
  const appPath = app.getAppPath();
  return app.isPackaged
    ? join(`${appPath}.unpacked`, ".vite/build/plugins/posthog")
    : join(appPath, ".vite/build/plugins/posthog");
}

export function runtimePluginDir(): string {
  return join(app.getPath("userData"), "plugins", "posthog");
}

export function runtimeSkillsDir(): string {
  return join(app.getPath("userData"), "skills");
}

export function getPluginPath(): string {
  if (isDevBuild()) return bundledPluginDir();
  const runtimeDir = runtimePluginDir();
  if (fs.existsSync(join(runtimeDir, "plugin.json"))) return runtimeDir;
  return bundledPluginDir();
}
