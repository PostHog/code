import { afterEach, describe, expect, it } from "vitest";
import {
  clearMcpToolMetadataCache,
  isMcpToolReadOnly,
  POSTHOG_READ_ONLY_TOOLS,
} from "./tool-metadata.js";

describe("isMcpToolReadOnly", () => {
  afterEach(() => {
    clearMcpToolMetadataCache();
  });

  it("returns true for all tools in POSTHOG_READ_ONLY_TOOLS", () => {
    expect(POSTHOG_READ_ONLY_TOOLS.size).toBeGreaterThan(0);
    for (const tool of POSTHOG_READ_ONLY_TOOLS) {
      expect(isMcpToolReadOnly(tool), `expected ${tool} to be read-only`).toBe(
        true,
      );
    }
  });

  it("returns false for PostHog mutating tools", () => {
    const mutatingTools = [
      "mcp__posthog__execute-sql",
      "mcp__posthog__create-feature-flag",
      "mcp__posthog__delete-feature-flag",
      "mcp__posthog__update-feature-flag",
      "mcp__posthog__dashboard-create",
      "mcp__posthog__dashboard-delete",
      "mcp__posthog__dashboard-update",
      "mcp__posthog__insight-create-from-query",
      "mcp__posthog__insight-delete",
      "mcp__posthog__insight-update",
      "mcp__posthog__survey-create",
      "mcp__posthog__survey-delete",
      "mcp__posthog__experiment-create",
      "mcp__posthog__experiment-delete",
      "mcp__posthog__action-create",
      "mcp__posthog__action-delete",
      "mcp__posthog__update-issue-status",
    ];

    for (const tool of mutatingTools) {
      expect(
        isMcpToolReadOnly(tool),
        `expected ${tool} to require permission`,
      ).toBe(false);
    }
  });

  it("returns false for unknown tools", () => {
    expect(isMcpToolReadOnly("mcp__unknown__some-tool")).toBe(false);
    expect(isMcpToolReadOnly("Bash")).toBe(false);
    expect(isMcpToolReadOnly("Read")).toBe(false);
  });
});
