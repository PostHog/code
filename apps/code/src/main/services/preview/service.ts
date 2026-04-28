import { inject, injectable, preDestroy } from "inversify";
import * as pty from "node-pty";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import { TypedEventEmitter } from "../../utils/typed-event-emitter";
import { validatePreviewInput } from "../posthog-code-mcp/tools/register-preview";
import type { PreviewEntry } from "../scratchpad/schemas";
import type { ScratchpadService } from "../scratchpad/service";
import type {
  PreviewExitedPayload,
  PreviewListEntry,
  PreviewReadyPayload,
  PreviewRegisteredPayload,
  PreviewStatus,
  PreviewUnregisteredPayload,
} from "./schemas";

const log = logger.scope("preview-service");

const HEALTH_TIMEOUT_MS = 60_000;
const HEALTH_INTERVAL_MS = 1_000;

export const PreviewServiceEvent = {
  PreviewRegistered: "previewRegistered",
  PreviewReady: "previewReady",
  PreviewExited: "previewExited",
  PreviewUnregistered: "previewUnregistered",
} as const;

export interface PreviewServiceEvents {
  [PreviewServiceEvent.PreviewRegistered]: PreviewRegisteredPayload;
  [PreviewServiceEvent.PreviewReady]: PreviewReadyPayload;
  [PreviewServiceEvent.PreviewExited]: PreviewExitedPayload;
  [PreviewServiceEvent.PreviewUnregistered]: PreviewUnregisteredPayload;
}

interface PreviewProcess {
  taskId: string;
  name: string;
  pid: number | undefined;
  ptyProcess: pty.IPty;
  port: number;
  command: string;
  cwd: string;
  status: PreviewStatus;
  exitListeners: pty.IDisposable[];
  /** Cancels the in-flight health probe when the process is killed early. */
  healthAbort: AbortController;
}

interface RegisterArgs {
  taskId: string;
  scratchpadRoot: string;
  name: string;
  command: string;
  port: number;
  cwd?: string;
  healthPath?: string;
}

function makeKey(taskId: string, name: string): string {
  return `${taskId}::${name}`;
}

/**
 * Owns the lifecycle of long-running preview processes (e.g. `pnpm dev`)
 * spawned on behalf of the agent via the `posthog_code__registerPreview`
 * MCP tool. Multiple previews per task are supported, keyed by
 * `(taskId, name)` — re-registering with the same key kills the prior one.
 *
 * The service:
 *   - validates input via `validatePreviewInput` (cwd traversal + port denylist)
 *   - spawns the command in a pty
 *   - polls `http://127.0.0.1:{port}{healthPath}` for up to 60s
 *   - on success: writes the manifest's `preview` array and emits `PreviewReady`
 *   - on timeout / early exit: kills the process and emits `PreviewExited`
 *   - on app shutdown: kills every running preview (`@preDestroy`)
 */
@injectable()
export class PreviewService extends TypedEventEmitter<PreviewServiceEvents> {
  private readonly processes = new Map<string, PreviewProcess>();

  constructor(
    @inject(MAIN_TOKENS.ScratchpadService)
    private readonly scratchpadService: ScratchpadService,
  ) {
    super();
  }

  public async register(args: RegisterArgs): Promise<{ url: string }> {
    const { cwd, port } = validatePreviewInput(
      {
        name: args.name,
        command: args.command,
        port: args.port,
        cwd: args.cwd,
        healthPath: args.healthPath,
      },
      args.scratchpadRoot,
    );

    // Reject if a *different* preview is already on this port.
    for (const [key, p] of this.processes) {
      if (p.port === port && key !== makeKey(args.taskId, args.name)) {
        throw new Error(
          `port ${port} is already in use by preview "${p.name}" of task "${p.taskId}"`,
        );
      }
    }

    // Re-registering same `(taskId, name)` — kill the prior process first.
    const existingKey = makeKey(args.taskId, args.name);
    const existing = this.processes.get(existingKey);
    if (existing) {
      log.info("Re-registering preview, killing prior process", {
        taskId: args.taskId,
        name: args.name,
        priorPid: existing.pid,
      });
      this.killProcess(existing);
      this.processes.delete(existingKey);
    }

    const url = `http://127.0.0.1:${port}`;
    log.info("Spawning preview process", {
      taskId: args.taskId,
      name: args.name,
      command: args.command,
      cwd,
      port,
    });

    const ptyProcess = pty.spawn("/bin/sh", ["-lc", args.command], {
      cwd,
      env: { ...process.env } as { [key: string]: string },
    });

    const proc: PreviewProcess = {
      taskId: args.taskId,
      name: args.name,
      pid: ptyProcess.pid,
      ptyProcess,
      port,
      command: args.command,
      cwd,
      status: "starting",
      exitListeners: [],
      healthAbort: new AbortController(),
    };
    this.processes.set(existingKey, proc);

    let exited = false;
    type ExitInfo = { exitCode: number; signal?: number };
    let exitInfo = null as ExitInfo | null;
    const exitListener = ptyProcess.onExit(
      (info: { exitCode: number; signal?: number }) => {
        exited = true;
        exitInfo = info;
        proc.status = "exited";
        log.info("Preview process exited", {
          taskId: args.taskId,
          name: args.name,
          exitCode: info.exitCode,
          signal: info.signal,
        });
        this.emit(PreviewServiceEvent.PreviewExited, {
          taskId: args.taskId,
          name: args.name,
          exitCode: info.exitCode,
          signal: info.signal != null ? String(info.signal) : null,
        });
        // If health-probe never finished, leave the process out of `processes`
        // map so resources aren't leaked.
        const current = this.processes.get(existingKey);
        if (current === proc) {
          this.processes.delete(existingKey);
        }
      },
    );
    proc.exitListeners.push(exitListener);

    this.emit(PreviewServiceEvent.PreviewRegistered, {
      taskId: args.taskId,
      name: args.name,
      url,
      port,
    });

    const healthPath = args.healthPath ?? "/";
    const healthOk = await this.waitForHealth({
      url: `http://127.0.0.1:${port}${healthPath}`,
      isExited: () => exited,
      timeoutMs: HEALTH_TIMEOUT_MS,
      intervalMs: HEALTH_INTERVAL_MS,
      signal: proc.healthAbort.signal,
    });

    if (!healthOk) {
      // Either timed out or process exited before we got a response.
      if (!exited) {
        // Timeout — kill it.
        this.killProcess(proc);
        this.processes.delete(existingKey);
        this.emit(PreviewServiceEvent.PreviewExited, {
          taskId: args.taskId,
          name: args.name,
          exitCode: -1,
          signal: "TIMEOUT",
        });
        throw new Error(
          `preview "${args.name}" did not become ready on port ${port} within ${
            HEALTH_TIMEOUT_MS / 1000
          }s`,
        );
      }
      const code = exitInfo?.exitCode ?? null;
      throw new Error(
        `preview "${args.name}" exited before becoming ready (exit code ${code})`,
      );
    }

    proc.status = "ready";
    log.info("Preview ready", {
      taskId: args.taskId,
      name: args.name,
      url,
    });

    // Update the manifest's preview array atomically.
    try {
      const manifest = await this.scratchpadService.readManifest(args.taskId);
      const filtered = (manifest.preview ?? []).filter(
        (p) => p.name !== args.name,
      );
      const next: PreviewEntry[] = [
        ...filtered,
        {
          name: args.name,
          command: args.command,
          port,
          cwd: args.cwd,
        },
      ];
      await this.scratchpadService.writeManifest(args.taskId, {
        preview: next,
      });
    } catch (err) {
      log.warn("Failed to persist preview to manifest", {
        taskId: args.taskId,
        name: args.name,
        err,
      });
    }

    this.emit(PreviewServiceEvent.PreviewReady, {
      taskId: args.taskId,
      name: args.name,
      url,
      port,
    });

    return { url };
  }

  public async unregister(taskId: string, name?: string): Promise<void> {
    if (name) {
      const key = makeKey(taskId, name);
      const proc = this.processes.get(key);
      if (!proc) return;
      this.killProcess(proc);
      this.processes.delete(key);
      this.emit(PreviewServiceEvent.PreviewUnregistered, { taskId, name });
      return;
    }

    // Kill every preview belonging to this task.
    const targets: PreviewProcess[] = [];
    for (const [key, p] of this.processes) {
      if (p.taskId === taskId) {
        targets.push(p);
        this.processes.delete(key);
      }
    }
    for (const p of targets) {
      this.killProcess(p);
      this.emit(PreviewServiceEvent.PreviewUnregistered, {
        taskId,
        name: p.name,
      });
    }
  }

  public async list(taskId: string): Promise<PreviewListEntry[]> {
    const out: PreviewListEntry[] = [];
    for (const p of this.processes.values()) {
      if (p.taskId !== taskId) continue;
      out.push({
        name: p.name,
        url: `http://127.0.0.1:${p.port}`,
        port: p.port,
        status: p.status,
      });
    }
    return out;
  }

  /**
   * Re-register every preview saved in `manifest.preview` for `taskId`.
   * Per-preview failures are caught and surfaced as `PreviewExited` events
   * so a single broken entry doesn't block the others (or app startup).
   */
  public async resumeFromManifest(
    taskId: string,
    scratchpadRoot: string,
  ): Promise<void> {
    let manifest: Awaited<ReturnType<ScratchpadService["readManifest"]>>;
    try {
      manifest = await this.scratchpadService.readManifest(taskId);
    } catch (err) {
      log.warn("resumeFromManifest: cannot read manifest", { taskId, err });
      return;
    }
    const entries = manifest.preview ?? [];
    await Promise.all(
      entries.map(async (entry) => {
        try {
          await this.register({
            taskId,
            scratchpadRoot,
            name: entry.name,
            command: entry.command,
            port: entry.port,
            cwd: entry.cwd,
          });
        } catch (err) {
          log.warn("resumeFromManifest: failed to resume preview", {
            taskId,
            name: entry.name,
            err,
          });
          this.emit(PreviewServiceEvent.PreviewExited, {
            taskId,
            name: entry.name,
            exitCode: -1,
            signal: "RESUME_FAILED",
          });
        }
      }),
    );
  }

  @preDestroy()
  public async shutdown(): Promise<void> {
    log.info("Shutting down PreviewService", {
      count: this.processes.size,
    });
    const toKill = Array.from(this.processes.values());
    this.processes.clear();
    for (const p of toKill) {
      this.killProcess(p);
    }
  }

  private killProcess(proc: PreviewProcess): void {
    proc.healthAbort.abort();
    for (const d of proc.exitListeners) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
    proc.exitListeners = [];
    try {
      proc.ptyProcess.kill();
    } catch (err) {
      log.warn("Failed to kill preview pty", { name: proc.name, err });
    }
  }

  /**
   * Poll `url` once per `intervalMs` until it returns 2xx, 3xx, or 404
   * (treated as "the server is up"), the process exits, `signal` aborts,
   * or `timeoutMs` elapses. Returns `true` on success, `false` otherwise.
   */
  private async waitForHealth(opts: {
    url: string;
    isExited: () => boolean;
    timeoutMs: number;
    intervalMs: number;
    signal?: AbortSignal;
  }): Promise<boolean> {
    const deadline = Date.now() + opts.timeoutMs;
    while (Date.now() < deadline) {
      if (opts.signal?.aborted) return false;
      if (opts.isExited()) return false;
      try {
        const res = await fetch(opts.url, {
          method: "GET",
          signal: opts.signal,
        });
        const code = res.status;
        if ((code >= 200 && code < 400) || code === 404) {
          return true;
        }
      } catch {
        // Server isn't up yet (or fetch was aborted) — fall through.
      }
      if (opts.signal?.aborted) return false;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, opts.intervalMs);
        opts.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
    return false;
  }
}
