import type { AcpMessage } from "@shared/types/session-events";
import { useMemo } from "react";

export interface ContextUsage {
  used: number;
  size: number;
  percentage: number;
  cost: { amount: number; currency: string } | null;
}

/**
 * Extract the latest context window usage from session events.
 * Scans backwards to find the most recent usage_update notification.
 * Re-derives on each new event, giving live updates during streaming.
 */
export function useContextUsage(events: AcpMessage[]): ContextUsage | null {
  return useMemo(() => extractContextUsage(events), [events]);
}

export function extractContextUsage(events: AcpMessage[]): ContextUsage | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const msg = events[i].message;
    if (
      "method" in msg &&
      msg.method === "session/update" &&
      !("id" in msg) &&
      "params" in msg
    ) {
      const params = msg.params as
        | {
            update?: {
              sessionUpdate?: string;
              used?: number;
              size?: number;
              cost?: { amount: number; currency: string } | null;
            };
          }
        | undefined;
      const update = params?.update;
      if (
        update?.sessionUpdate === "usage_update" &&
        typeof update.used === "number" &&
        typeof update.size === "number"
      ) {
        const percentage =
          update.size > 0
            ? Math.min(100, Math.round((update.used / update.size) * 100))
            : 0;
        return {
          used: update.used,
          size: update.size,
          percentage,
          cost: update.cost ?? null,
        };
      }
    }
  }
  return null;
}
