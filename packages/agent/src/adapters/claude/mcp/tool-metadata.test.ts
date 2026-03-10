import { afterEach, describe, expect, it } from "vitest";
import {
  clearMcpToolMetadataCache,
  isMcpToolReadOnly,
} from "./tool-metadata.js";

describe("isMcpToolReadOnly", () => {
  afterEach(() => {
    clearMcpToolMetadataCache();
  });

  it("returns true for known PostHog read-only tools", () => {
    const readOnlyTools = [
      "mcp__posthog__read-data-schema",
      "mcp__posthog__read-data-warehouse-schema",
      "mcp__posthog__dashboard-get",
      "mcp__posthog__dashboards-get-all",
      "mcp__posthog__docs-search",
      "mcp__posthog__error-details",
      "mcp__posthog__list-errors",
      "mcp__posthog__experiment-results-get",
      "mcp__posthog__insight-query",
      "mcp__posthog__get-llm-total-costs-for-project",
      "mcp__posthog__organization-details-get",
      "mcp__posthog__organizations-get",
      "mcp__posthog__projects-get",
      "mcp__posthog__surveys-global-stats",
      "mcp__posthog__survey-stats",
      "mcp__posthog__logs-query",
      "mcp__posthog__logs-list-attributes",
      "mcp__posthog__logs-list-attribute-values",
      "mcp__posthog__debug-mcp-ui-apps",
    ];

    for (const tool of readOnlyTools) {
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
