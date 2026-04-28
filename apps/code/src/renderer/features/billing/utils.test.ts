import type { UsageOutput } from "@main/services/llm-gateway/schemas";
import { describe, expect, it } from "vitest";
import { isUsageExceeded } from "./utils";

function makeUsage(
  overrides: Partial<{
    sustained: boolean;
    burst: boolean;
    isRateLimited: boolean;
  }> = {},
): UsageOutput {
  return {
    product: "posthog_code",
    user_id: 1,
    sustained: {
      used_percent: 50,
      resets_in_seconds: 3600,
      exceeded: overrides.sustained ?? false,
    },
    burst: {
      used_percent: 30,
      resets_in_seconds: 600,
      exceeded: overrides.burst ?? false,
    },
    is_rate_limited: overrides.isRateLimited ?? false,
  };
}

describe("isUsageExceeded", () => {
  it("returns false when nothing is exceeded", () => {
    expect(isUsageExceeded(makeUsage())).toBe(false);
  });

  it("returns true when sustained is exceeded", () => {
    expect(isUsageExceeded(makeUsage({ sustained: true }))).toBe(true);
  });

  it("returns true when burst is exceeded", () => {
    expect(isUsageExceeded(makeUsage({ burst: true }))).toBe(true);
  });

  it("returns true when rate limited", () => {
    expect(isUsageExceeded(makeUsage({ isRateLimited: true }))).toBe(true);
  });

  it("returns true when all flags are set", () => {
    expect(
      isUsageExceeded(
        makeUsage({ sustained: true, burst: true, isRateLimited: true }),
      ),
    ).toBe(true);
  });
});
