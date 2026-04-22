import { execFile } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Resolves the primary worktree (main repository) path for a given cwd.
 *
 * Secondary git worktrees share a `.git` common directory with the primary
 * worktree. Returning the primary worktree path lets us scope per-repo
 * settings — such as "don't ask again" permission rules — to a single
 * location that every worktree of the same repository can read from.
 *
 * Returns `cwd` when the directory is not inside a git repository or when
 * `git` is unavailable.
 */
export async function resolveMainRepoPath(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, timeout: 2_000 },
    );
    const commonDir = stdout.trim();
    if (!commonDir) {
      return cwd;
    }
    // `--git-common-dir` points to the primary worktree's `.git` directory,
    // whose parent is the primary worktree root. For bare repositories the
    // common dir is the repo itself; in that case `cwd` is the best guess.
    const parent = path.dirname(commonDir);
    return path.basename(commonDir) === ".git" ? parent : cwd;
  } catch {
    return cwd;
  }
}
