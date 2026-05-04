import { spawn } from "node:child_process";
import type { Logger } from "../utils/logger";

export interface GhExecOptions {
  cwd: string;
  timeoutMs: number;
  logger?: Logger;
}

export interface GhExecResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
}

const KILL_GRACE_MS = 2_000;

export function runGh(
  args: string[],
  options: GhExecOptions,
): Promise<GhExecResult> {
  // Binary is pinned here. Callers (incl. the HTTP route) cannot override it —
  // the body schema strips unknowns and runGh has no binary parameter.
  return spawnAndCollect("gh", args, options);
}

export async function spawnAndCollect(
  binary: string,
  args: string[],
  options: GhExecOptions,
): Promise<GhExecResult> {
  const logger = options.logger;

  logger?.debug("Running command", {
    binary,
    args,
    cwd: options.cwd,
    timeoutMs: options.timeoutMs,
  });

  return new Promise<GhExecResult>((resolve, reject) => {
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | null = null;

    const timeout = setTimeout(() => {
      timedOut = true;
      logger?.warn("Command timed out, sending SIGTERM", {
        pid: child.pid,
        timeoutMs: options.timeoutMs,
      });
      child.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (!child.killed) {
          logger?.warn("Command did not exit, sending SIGKILL", {
            pid: child.pid,
          });
          child.kill("SIGKILL");
        }
      }, KILL_GRACE_MS);
    }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      reject(err);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        signal,
        timedOut,
      });
    });
  });
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  if (address === "::1" || address === "localhost") return true;
  // IPv4 reserves the full 127.0.0.0/8 range as loopback, and IPv4-mapped
  // IPv6 covers ::ffff:127.0.0.0/104 — match by prefix rather than equality.
  if (address.startsWith("127.")) return true;
  if (address.startsWith("::ffff:127.")) return true;
  return false;
}
