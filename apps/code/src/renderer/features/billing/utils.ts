interface UsageLimitCheck {
  sustained: { exceeded: boolean };
  burst: { exceeded: boolean };
  is_rate_limited: boolean;
}

export function isUsageExceeded(usage: UsageLimitCheck): boolean {
  return (
    usage.is_rate_limited || usage.sustained.exceeded || usage.burst.exceeded
  );
}
