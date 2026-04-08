import { initTRPC } from "@trpc/server";
import log from "electron-log/main";

const trpc = initTRPC.create({
  isServer: true,
});

const CALL_RATE_WINDOW_MS = 2000;
const CALL_RATE_THRESHOLD = 50;

const callCounts: Record<string, number[]> = {};

const ipcTimingEnabled = process.env.IPC_TIMINGS === "true";
const ipcTimingBootMs = 15_000;
const bootTime = Date.now();

const callRateMonitor = trpc.middleware(async ({ path, next, type }) => {
  if (ipcTimingEnabled) {
    const elapsed = Date.now() - bootTime;
    if (elapsed < ipcTimingBootMs) {
      const t = performance.now();
      log.info(`[ipc-timing] >> ${type} ${path}`);
      const result = await next();
      log.info(
        `[ipc-timing] << ${type} ${path}: ${(performance.now() - t).toFixed(0)}ms`,
      );
      return result;
    }
  }

  if (process.env.NODE_ENV !== "development") {
    return next();
  }

  const now = Date.now();
  if (!callCounts[path]) {
    callCounts[path] = [];
  }

  const timestamps = callCounts[path];
  timestamps.push(now);

  const cutoff = now - CALL_RATE_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= CALL_RATE_THRESHOLD) {
  }

  return next();
});

export const router = trpc.router;
export const publicProcedure = trpc.procedure.use(callRateMonitor);
export const middleware = trpc.middleware;
