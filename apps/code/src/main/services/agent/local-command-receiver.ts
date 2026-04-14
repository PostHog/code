import { inject, injectable, preDestroy } from "inversify";
import { MAIN_TOKENS } from "../../di/tokens";
import { logger } from "../../utils/logger";
import type { AuthService } from "../auth/service";

const log = logger.scope("local-command-receiver");
const INITIAL_RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30_000;
// After this many consecutive failures, assume Last-Event-ID is stale (event
// trimmed from the backend buffer) and fall back to a fresh connect with
// start=latest. Accepts that we may drop commands issued during the outage.
const STALE_EVENT_ID_THRESHOLD = 3;

/**
 * JSON-RPC envelope carried inside an `incoming_command` SSE event. The
 * backend repackages whatever mobile POSTs to /command/ into this shape
 * (see products/tasks/backend/api.py :: command).
 */
export interface IncomingCommandPayload {
  jsonrpc: string;
  method: string;
  params?: { content?: string } & Record<string, unknown>;
  id?: string | number;
}

interface SubscribeParams {
  taskId: string;
  taskRunId: string;
  projectId: number;
  apiHost: string;
  onCommand: (payload: IncomingCommandPayload) => Promise<void>;
}

interface Subscription {
  taskRunId: string;
  controller: AbortController;
}

/**
 * Subscribes to the PostHog task-run SSE stream for a local run and
 * delivers `incoming_command` events (published by the backend when mobile
 * POSTs to /command/ on a run with environment=local) to a caller-supplied
 * callback.
 *
 * One SSE connection per subscribed run. Reconnects with backoff on failure.
 * Uses the `Last-Event-ID` header to resume from the last processed event
 * so brief network blips don't drop commands.
 */
@injectable()
export class LocalCommandReceiver {
  private readonly subs = new Map<string, Subscription>();

  constructor(
    @inject(MAIN_TOKENS.AuthService)
    private readonly auth: AuthService,
  ) {}

  subscribe(params: SubscribeParams): void {
    if (this.subs.has(params.taskRunId)) {
      log.debug("Already subscribed", { taskRunId: params.taskRunId });
      return;
    }
    const controller = new AbortController();
    this.subs.set(params.taskRunId, {
      taskRunId: params.taskRunId,
      controller,
    });
    log.info("Subscribing to SSE stream", { taskRunId: params.taskRunId });
    void this.connectLoop(params, controller).catch((err) => {
      if (controller.signal.aborted) return;
      log.error("Connect loop exited unexpectedly", {
        taskRunId: params.taskRunId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  unsubscribe(taskRunId: string): void {
    const sub = this.subs.get(taskRunId);
    if (!sub) return;
    sub.controller.abort();
    this.subs.delete(taskRunId);
    log.info("Unsubscribed", { taskRunId });
  }

  @preDestroy()
  async shutdown(): Promise<void> {
    // Abort before awaiting teardown — per async-cleanup-ordering guidance.
    for (const sub of this.subs.values()) sub.controller.abort();
    this.subs.clear();
  }

  private async connectLoop(
    params: SubscribeParams,
    controller: AbortController,
  ): Promise<void> {
    let lastEventId: string | undefined;
    let consecutiveFailures = 0;

    while (!controller.signal.aborted) {
      let streamOpened = false;
      try {
        const { accessToken } = await this.auth.getValidAccessToken();
        const url = new URL(
          `${params.apiHost}/api/projects/${params.projectId}/tasks/${params.taskId}/runs/${params.taskRunId}/stream/`,
        );
        if (!lastEventId) {
          // Fresh connect: only care about events published from now on.
          // On reconnect we use Last-Event-ID instead (see headers below).
          url.searchParams.set("start", "latest");
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${accessToken}`,
          Accept: "text/event-stream",
        };
        if (lastEventId) headers["Last-Event-ID"] = lastEventId;

        const response = await fetch(url.toString(), {
          headers,
          signal: controller.signal,
        });
        if (!response.ok) {
          const body = await response.text().catch(() => "");
          throw new Error(
            `SSE HTTP ${response.status}${body ? `: ${body.slice(0, 200)}` : ""}`,
          );
        }

        streamOpened = true;
        consecutiveFailures = 0;
        lastEventId = await this.readEventStream(
          response.body,
          params.onCommand,
          controller.signal,
          lastEventId,
        );
        log.info("SSE stream ended cleanly", {
          taskRunId: params.taskRunId,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!streamOpened) consecutiveFailures++;
        if (
          consecutiveFailures >= STALE_EVENT_ID_THRESHOLD &&
          lastEventId !== undefined
        ) {
          log.warn(
            "Dropping possibly-stale Last-Event-ID after repeated failures",
            {
              taskRunId: params.taskRunId,
              consecutiveFailures,
            },
          );
          lastEventId = undefined;
        }
        log.warn("SSE disconnected, will reconnect", {
          taskRunId: params.taskRunId,
          consecutiveFailures,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (controller.signal.aborted) return;
      const delay = Math.min(
        MAX_RECONNECT_DELAY_MS,
        INITIAL_RECONNECT_DELAY_MS * 2 ** Math.max(0, consecutiveFailures - 1),
      );
      await this.sleep(delay, controller.signal);
    }
  }

  private async readEventStream(
    body: ReadableStream<Uint8Array> | null,
    onCommand: SubscribeParams["onCommand"],
    signal: AbortSignal,
    seedLastEventId: string | undefined,
  ): Promise<string | undefined> {
    if (!body) throw new Error("Missing SSE response body");
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastEventId = seedLastEventId;

    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) return lastEventId;
        buffer += decoder.decode(value, { stream: true });

        // SSE event blocks are separated by a blank line (\n\n).
        while (true) {
          const separator = buffer.indexOf("\n\n");
          if (separator === -1) break;
          const rawEvent = buffer.slice(0, separator);
          buffer = buffer.slice(separator + 2);

          let dataChunks = "";
          let eventId: string | undefined;
          for (const line of rawEvent.split("\n")) {
            if (line.startsWith("data: ")) {
              dataChunks += line.slice(6);
            } else if (line.startsWith("id: ")) {
              eventId = line.slice(4);
            }
            // `event:` and comments are ignored — we route on data.type.
          }
          if (!dataChunks) continue;

          let parsed: unknown;
          try {
            parsed = JSON.parse(dataChunks);
          } catch {
            log.warn("Failed to parse SSE data chunk", {
              preview: dataChunks.slice(0, 120),
            });
            continue;
          }

          if (
            typeof parsed === "object" &&
            parsed !== null &&
            (parsed as { type?: unknown }).type === "incoming_command"
          ) {
            const payload = (parsed as { payload?: unknown }).payload;
            if (payload && typeof payload === "object") {
              try {
                await onCommand(payload as IncomingCommandPayload);
              } catch (err) {
                log.error("Incoming command handler threw", {
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }

          if (eventId) lastEventId = eventId;
        }
      }
      return lastEventId;
    } finally {
      try {
        await reader.cancel();
      } catch {
        // Reader already closed or cancelled; nothing to do.
      }
    }
  }

  private sleep(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
