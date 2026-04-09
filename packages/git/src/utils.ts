import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface GitHubRepo {
  organization: string;
  repository: string;
}

export async function safeSymlink(
  source: string,
  target: string,
  type: "file" | "dir",
): Promise<boolean> {
  if (path.resolve(source) === path.resolve(target)) {
    return false;
  }

  const sourceDir = path.dirname(path.resolve(source));
  const targetDir = path.dirname(path.resolve(target));
  if (
    sourceDir === targetDir &&
    path.basename(source) === path.basename(target)
  ) {
    return false;
  }

  try {
    await fs.access(source);
  } catch {
    return false;
  }

  try {
    if (os.platform() === "win32") {
      // On Windows, skip symlinks entirely — they need admin/Developer Mode.
      // Use junctions for directories and hard links for files instead,
      // matching the approach used by pnpm, Deno, and npm.
      if (type === "dir") {
        await fs.symlink(source, target, "junction");
      } else {
        try {
          await fs.link(source, target);
        } catch {
          // Hard link can fail across drives — copy as last resort
          await fs.copyFile(source, target);
        }
      }
    } else {
      await fs.symlink(source, target, type);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
}

/**
 * copy file or directory, use copy-on-write, fall back to cp
 */
export async function clonePath(
  source: string,
  destination: string,
): Promise<boolean> {
  try {
    await fs.access(source);
  } catch {
    return false;
  }

  const parentDir = path.dirname(destination);
  await fs.mkdir(parentDir, { recursive: true });

  const platform = os.platform();

  try {
    if (platform === "darwin") {
      await execFileAsync("cp", ["-c", "-a", source, destination]);
    } else {
      await execFileAsync("cp", ["--reflink=auto", "-a", source, destination]);
    }
    return true;
  } catch {
    // CoW not supported, fall back to regular copy
  }

  await fs.cp(source, destination, { recursive: true });
  return true;
}

function execFileAsync(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export interface GitHubPr {
  owner: string;
  repo: string;
  number: number;
}

export function parsePrUrl(prUrl: string): GitHubPr | null {
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], number: Number(match[3]) };
}

export function parseGitHubUrl(url: string): GitHubRepo | null {
  // Trim whitespace/newlines that git commands may include
  const trimmedUrl = url.trim();

  const match =
    trimmedUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/) ||
    trimmedUrl.match(/git@github\.com:(.+?)\/(.+?)(\.git)?$/);

  if (!match) return null;

  return { organization: match[1], repository: match[2].replace(/\.git$/, "") };
}
