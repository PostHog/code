import { describe, expect, it, vi } from "vitest";

vi.mock("@features/auth/hooks/authQueries", () => ({
  getCachedAuthState: () => ({ cloudRegion: null }),
}));

import { getBillingUrl, getPostHogUrl } from "./urls";

describe("getPostHogUrl", () => {
  it("returns null when no region is available", () => {
    expect(getPostHogUrl("/foo")).toBeNull();
  });

  it("joins base and path for us region", () => {
    expect(getPostHogUrl("/foo", "us")).toBe("https://us.posthog.com/foo");
  });

  it("adds a leading slash if missing", () => {
    expect(getPostHogUrl("foo", "us")).toBe("https://us.posthog.com/foo");
  });

  it("uses the eu base for eu region", () => {
    expect(getPostHogUrl("/foo", "eu")).toBe("https://eu.posthog.com/foo");
  });
});

describe("getBillingUrl", () => {
  it("points at /organization/billing/overview on us", () => {
    expect(getBillingUrl("us")).toBe(
      "https://us.posthog.com/organization/billing/overview",
    );
  });

  it("points at /organization/billing/overview on eu", () => {
    expect(getBillingUrl("eu")).toBe(
      "https://eu.posthog.com/organization/billing/overview",
    );
  });

  it("returns null when no region is available", () => {
    expect(getBillingUrl()).toBeNull();
  });

  it("does not produce the malformed double-scheme URL we used to ship", () => {
    const url = getBillingUrl("us");
    expect(url).not.toMatch(/https?:\/\/[^/]+\/https?:/);
    expect(url).not.toContain("/project/");
  });
});
