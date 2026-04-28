import type { UsageOutput } from "@main/services/llm-gateway/schemas";

export function isUsageExceeded(usage: UsageOutput): boolean {
  return (
    usage.is_rate_limited || usage.sustained.exceeded || usage.burst.exceeded
  );
}
