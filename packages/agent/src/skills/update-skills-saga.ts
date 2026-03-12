import { existsSync } from "node:fs";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Saga } from "@posthog/shared";
import { unzipSync } from "fflate";
import { extractZip } from "./extract-zip.js";

export async function overlayDownloadedSkills(
  runtimeSkillsDir: string,
  runtimePluginDir: string,
): Promise<void> {
  if (!existsSync(runtimeSkillsDir)) {
    return;
  }

  const destSkillsDir = join(runtimePluginDir, "skills");
  await mkdir(destSkillsDir, { recursive: true });

  const entries = await readdir(runtimeSkillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const src = join(runtimeSkillsDir, entry.name);
      const dest = join(destSkillsDir, entry.name);
      await rm(dest, { recursive: true, force: true });
      await cp(src, dest, { recursive: true });
    }
  }
}

export async function syncCodexSkills(
  pluginPath: string,
  codexSkillsDir: string,
): Promise<void> {
  const effectiveSkillsDir = join(pluginPath, "skills");
  if (!existsSync(effectiveSkillsDir)) {
    return;
  }

  try {
    await mkdir(codexSkillsDir, { recursive: true });

    const entries = await readdir(effectiveSkillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const src = join(effectiveSkillsDir, entry.name);
        const dest = join(codexSkillsDir, entry.name);
        await rm(dest, { recursive: true, force: true });
        await cp(src, dest, { recursive: true });
      }
    }
  } catch {
    // Fire-and-forget — don't block startup or updates on Codex sync
  }
}

export interface UpdateSkillsInput {
  runtimeSkillsDir: string;
  runtimePluginDir: string;
  pluginPath: string;
  codexSkillsDir: string;
  tempDir: string;
  skillsZipUrl: string;
  contextMillZipUrl: string;
  downloadFile: (url: string, destPath: string) => Promise<void>;
}

export interface UpdateSkillsOutput {
  updated: boolean;
}

export class UpdateSkillsSaga extends Saga<
  UpdateSkillsInput,
  UpdateSkillsOutput
> {
  readonly sagaName = "UpdateSkillsSaga";

  protected async execute(
    input: UpdateSkillsInput,
  ): Promise<UpdateSkillsOutput> {
    const newSkillsDir = `${input.runtimeSkillsDir}.new`;

    await this.step({
      name: "create-staging-dir",
      execute: async () => {
        await rm(newSkillsDir, { recursive: true, force: true });
        await mkdir(newSkillsDir, { recursive: true });
        return newSkillsDir;
      },
      rollback: async (dir) => {
        await rm(dir, { recursive: true, force: true });
      },
    });

    await this.readOnlyStep("download-skills", async () => {
      try {
        await this.downloadAndMergeSkills(
          input.skillsZipUrl,
          input.tempDir,
          newSkillsDir,
          input.downloadFile,
        );
      } catch (err) {
        this.log.warn("Failed to download skills", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await this.readOnlyStep("download-context-mill-skills", async () => {
      if (!input.contextMillZipUrl) return;
      try {
        await this.downloadAndMergeContextMillSkills(
          input.contextMillZipUrl,
          input.tempDir,
          newSkillsDir,
          input.downloadFile,
        );
      } catch (err) {
        this.log.warn("Failed to download context-mill skills", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await this.readOnlyStep("validate-skills", async () => {
      const entries = await readdir(newSkillsDir);
      if (entries.length === 0) {
        throw new Error("No skills found from any source");
      }
    });

    const oldSkillsDir = `${input.runtimeSkillsDir}.old`;
    await this.step({
      name: "swap-skills-cache",
      execute: async () => {
        await rm(oldSkillsDir, { recursive: true, force: true });
        const hadExisting = existsSync(input.runtimeSkillsDir);
        if (hadExisting) {
          await rename(input.runtimeSkillsDir, oldSkillsDir);
        }
        await rename(newSkillsDir, input.runtimeSkillsDir);
        await rm(oldSkillsDir, { recursive: true, force: true });
        return hadExisting;
      },
      rollback: async (hadExisting) => {
        try {
          if (existsSync(input.runtimeSkillsDir)) {
            await rename(input.runtimeSkillsDir, newSkillsDir);
          }
          if (hadExisting && existsSync(oldSkillsDir)) {
            await rename(oldSkillsDir, input.runtimeSkillsDir);
          }
        } catch {
          // Best-effort rollback
        }
      },
    });

    await this.readOnlyStep("overlay-skills", async () => {
      try {
        await overlayDownloadedSkills(
          input.runtimeSkillsDir,
          input.runtimePluginDir,
        );
      } catch (err) {
        this.log.warn("Failed to overlay skills", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await this.readOnlyStep("sync-codex-skills", async () => {
      try {
        await syncCodexSkills(input.pluginPath, input.codexSkillsDir);
      } catch (err) {
        this.log.warn("Failed to sync codex skills", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return { updated: true };
  }

  private async downloadAndMergeSkills(
    url: string,
    tempDir: string,
    destDir: string,
    downloadFile: (url: string, destPath: string) => Promise<void>,
  ): Promise<void> {
    const zipPath = join(tempDir, "skills.zip");
    await downloadFile(url, zipPath);

    const extractDir = join(tempDir, "extracted");
    await mkdir(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    const skillsSource = await this.findSkillsDir(extractDir);
    if (!skillsSource) {
      this.log.warn("No skills directory found in archive");
      return;
    }

    const entries = await readdir(skillsSource, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const src = join(skillsSource, entry.name);
        const dest = join(destDir, entry.name);
        await rm(dest, { recursive: true, force: true });
        await cp(src, dest, { recursive: true });
      }
    }

    this.log.info("Skills merged");
  }

  private async findSkillsDir(extractDir: string): Promise<string | null> {
    const direct = join(extractDir, "skills");
    if (existsSync(direct)) {
      return direct;
    }

    const entries = await readdir(extractDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nested = join(extractDir, entry.name, "skills");
        if (existsSync(nested)) {
          return nested;
        }
      }
    }

    const hasSkillDirs = entries.some(
      (e) =>
        e.isDirectory() && existsSync(join(extractDir, e.name, "SKILL.md")),
    );
    if (hasSkillDirs) {
      return extractDir;
    }

    return null;
  }

  private async downloadAndMergeContextMillSkills(
    url: string,
    tempDir: string,
    destDir: string,
    downloadFile: (url: string, destPath: string) => Promise<void>,
  ): Promise<void> {
    const zipPath = join(tempDir, "context-mill.zip");
    await downloadFile(url, zipPath);

    const extractDir = join(tempDir, "cm-extracted");
    await mkdir(extractDir, { recursive: true });
    await extractZip(zipPath, extractDir);

    const files = await readdir(extractDir);
    for (const file of files) {
      if (!file.startsWith("omnibus-") || !file.endsWith(".zip")) continue;

      const strippedName = file.replace(/^omnibus-/, "").replace(/\.zip$/, "");
      const innerZipPath = join(extractDir, file);
      const innerZipData = await readFile(innerZipPath);
      const innerEntries = unzipSync(new Uint8Array(innerZipData));
      const skillDestDir = join(destDir, strippedName);
      await mkdir(skillDestDir, { recursive: true });

      for (const [innerFile, innerContent] of Object.entries(innerEntries)) {
        if (innerFile.endsWith("/")) {
          await mkdir(join(skillDestDir, innerFile), { recursive: true });
        } else {
          const fullPath = join(skillDestDir, innerFile);
          await mkdir(dirname(fullPath), { recursive: true });
          if (basename(innerFile) === "SKILL.md") {
            const text = new TextDecoder().decode(innerContent);
            const patched = text.replace(/^(name:\s*)omnibus-/m, "$1");
            await writeFile(fullPath, patched);
          } else {
            await writeFile(fullPath, innerContent);
          }
        }
      }
    }

    this.log.info("Context-mill omnibus skills merged");
  }
}
