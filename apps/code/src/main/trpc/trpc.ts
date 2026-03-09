import { initTRPC } from "@trpc/server";

const trpc = initTRPC.create({
  isServer: true,
});

const CALL_RATE_WINDOW_MS = 2000;
const CALL_RATE_THRESHOLD = 50;

const callCounts: Record<string, number[]> = {};

const callRateMonitor = trpc.middleware(async ({ path, next }) => {
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
