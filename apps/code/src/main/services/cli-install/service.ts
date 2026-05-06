import { exec, execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import type { IBundledResources } from "@posthog/platform/bundled-resources";
import { inject, injectable } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

const log = logger.scope("cli-install");

const TARGET_PATH = "/usr/local/bin/posthog-code";

export type InstallResult =
  | { success: true; target: string }
  | { success: false; error: string; canceled?: boolean };

@injectable()
export class CliInstallService {
  constructor(
    @inject(MAIN_TOKENS.BundledResources)
    private readonly bundledResources: IBundledResources,
  ) {}

  /**
   * Resolve the path to the bundled posthog-code wrapper.
   *
   * - In production (packaged app), this lives at
   *   `<App>.app/Contents/Resources/bin/posthog-code` via `extraResource`.
   * - In dev, it lives at `apps/code/bin/posthog-code` next to the source.
   */
  public getBundledCliPath(): string {
    return this.bundledResources.resolveExtraResource("bin/posthog-code");
  }

  /**
   * Install a `posthog-code` symlink in the user's PATH.
   *
   * Tries a direct symlink first (which works if `/usr/local/bin` is writable
   * by the user, e.g. on Homebrew-managed macOS). If that fails with a
   * permissions error, falls back to `osascript with administrator privileges`,
   * which surfaces the standard macOS sudo prompt.
   */
  public async install(): Promise<InstallResult> {
    if (process.platform !== "darwin") {
      return {
        success: false,
        error: "Installing the posthog-code CLI is only supported on macOS",
      };
    }

    const source = this.getBundledCliPath();
    if (!existsSync(source)) {
      log.error("Bundled CLI script missing", { source });
      return {
        success: false,
        error: `CLI script not found at ${source}`,
      };
    }

    log.info("Installing CLI", { source, target: TARGET_PATH });

    const direct = await this.tryDirectInstall(source);
    if (direct.success || direct.error !== "permission") {
      return direct.success
        ? { success: true, target: TARGET_PATH }
        : { success: false, error: direct.message };
    }

    log.info("Direct install needs elevation, trying osascript");
    return this.tryAdminInstall(source);
  }

  private async tryDirectInstall(
    source: string,
  ): Promise<
    | { success: true }
    | { success: false; error: "permission" | "other"; message: string }
  > {
    try {
      // `ln -sfn` atomically replaces an existing symlink at the target,
      // matching how VS Code's `code` command behaves on re-install.
      await execFileAsync("ln", ["-sfn", source, TARGET_PATH]);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isPermission =
        /permission denied/i.test(message) ||
        /EACCES/i.test(message) ||
        /not permitted/i.test(message) ||
        /no such file or directory/i.test(message);
      log.info("Direct install failed", { isPermission, message });
      return {
        success: false,
        error: isPermission ? "permission" : "other",
        message,
      };
    }
  }

  private async tryAdminInstall(source: string): Promise<InstallResult> {
    if (containsUnsafeChars(source)) {
      return {
        success: false,
        error: `Refusing to install: source path contains unsafe characters (${source})`,
      };
    }

    const shellCmd = `mkdir -p /usr/local/bin && ln -sfn '${source}' '${TARGET_PATH}'`;
    const appleScript = `do shell script "${escapeAppleScriptString(shellCmd)}" with administrator privileges`;

    try {
      await execAsync(`osascript -e ${JSON.stringify(appleScript)}`);
      return { success: true, target: TARGET_PATH };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/User canceled/i.test(message)) {
        log.info("User canceled admin prompt");
        return {
          success: false,
          error: "Installation canceled",
          canceled: true,
        };
      }
      log.error("Admin install failed", { message });
      return { success: false, error: message };
    }
  }
}

function containsUnsafeChars(value: string): boolean {
  return /['"\\$`]/.test(value);
}

function escapeAppleScriptString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
