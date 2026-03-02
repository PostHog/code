import { execSync } from "node:child_process";
import { platform } from "node:os";
import { logger } from "./logger.js";

const log = logger.scope("process-utils");

/**
 * Kill a process and all its children by killing the process group.
 * On Unix, we use process.kill(-pid) to kill the entire process group.
 * On Windows, we use taskkill with /T flag to kill the process tree.
 */
export function killProcessTree(pid: number): void {
  try {
    if (platform() === "win32") {
      // Windows: use taskkill with /T to kill process tree
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      for (const target of [-pid, pid]) {
        try {
          process.kill(target, "SIGKILL");
        } catch {}
      }
    }
  } catch (err) {
    log.warn(`Failed to kill process tree for PID ${pid}`, err);
  }
}

/**
 * Check if a process is alive using signal 0.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
