import { describe, expect, it } from "vitest";
import {
  getPostHogExecDisplay,
  isPostHogExecTool,
} from "./posthog-exec-display";

describe("isPostHogExecTool", () => {
  it("matches the bare posthog exec tool", () => {
    expect(isPostHogExecTool("mcp__posthog__exec")).toBe(true);
  });

  it("matches plugin-prefixed variants", () => {
    expect(isPostHogExecTool("mcp__posthog_posthog__exec")).toBe(true);
    expect(isPostHogExecTool("mcp__plugin_posthog_posthog__exec")).toBe(true);
    expect(isPostHogExecTool("mcp__posthog_cloud__exec")).toBe(true);
  });

  it("rejects other MCP tools", () => {
    expect(isPostHogExecTool("mcp__posthog__list")).toBe(false);
    expect(isPostHogExecTool("mcp__other__exec")).toBe(false);
    expect(isPostHogExecTool("Bash")).toBe(false);
  });
});

describe("getPostHogExecDisplay", () => {
  describe("call verb", () => {
    it("collapses `call <tool>` to the bare sub-tool label", () => {
      expect(
        getPostHogExecDisplay({ command: "call experiment-list" }),
      ).toEqual({
        label: "experiment-list",
        input: undefined,
      });
    });

    it("uses the JSON args portion as input", () => {
      expect(
        getPostHogExecDisplay({
          command: 'call execute-sql {"query":"SELECT 1"}',
        }),
      ).toEqual({
        label: "execute-sql",
        input: '{"query":"SELECT 1"}',
      });
    });

    it("handles `call --json <tool> {json}`", () => {
      expect(
        getPostHogExecDisplay({
          command: 'call --json experiment-update {"id":1}',
        }),
      ).toEqual({
        label: "experiment-update",
        input: '{"id":1}',
      });
    });
  });

  describe("info verb", () => {
    it("formats `info <tool>` with no args", () => {
      expect(getPostHogExecDisplay({ command: "info execute-sql" })).toEqual({
        label: "info execute-sql",
        input: undefined,
      });
    });

    it("falls back to bare `info` when no tool given", () => {
      expect(getPostHogExecDisplay({ command: "info" })).toEqual({
        label: "info",
        input: undefined,
      });
    });
  });

  describe("schema verb", () => {
    it("formats `schema <tool>` (no field path)", () => {
      expect(getPostHogExecDisplay({ command: "schema query-trends" })).toEqual(
        {
          label: "schema query-trends",
          input: undefined,
        },
      );
    });

    it("formats `schema <tool> <field_path>` with the path as input", () => {
      expect(
        getPostHogExecDisplay({
          command: "schema query-trends series",
        }),
      ).toEqual({
        label: "schema query-trends",
        input: "series",
      });
    });

    it("supports dotted field paths", () => {
      expect(
        getPostHogExecDisplay({
          command: "schema query-trends breakdownFilter.breakdowns",
        }),
      ).toEqual({
        label: "schema query-trends",
        input: "breakdownFilter.breakdowns",
      });
    });
  });

  describe("search verb", () => {
    it("uses the regex pattern as input", () => {
      expect(getPostHogExecDisplay({ command: "search query-" })).toEqual({
        label: "search",
        input: "query-",
      });
    });

    it("falls back to bare `search` when no pattern given", () => {
      expect(getPostHogExecDisplay({ command: "search" })).toEqual({
        label: "search",
        input: undefined,
      });
    });
  });

  describe("tools verb", () => {
    it("formats bare `tools`", () => {
      expect(getPostHogExecDisplay({ command: "tools" })).toEqual({
        label: "tools",
        input: undefined,
      });
    });
  });

  describe("explicit input field", () => {
    it("prefers an explicit string `input` over command-embedded args (call)", () => {
      expect(
        getPostHogExecDisplay({
          command: 'call execute-sql {"query":"SELECT 1"}',
          input: "SELECT 2",
        }),
      ).toEqual({ label: "execute-sql", input: "SELECT 2" });
    });

    it("prefers an explicit object `input` (serialised) over command-embedded args (call)", () => {
      expect(
        getPostHogExecDisplay({
          command: "call execute-sql",
          input: { query: "SELECT 1" },
        }),
      ).toEqual({ label: "execute-sql", input: '{"query":"SELECT 1"}' });
    });

    it("prefers explicit `input` over field path for schema", () => {
      expect(
        getPostHogExecDisplay({
          command: "schema query-trends",
          input: "series.0",
        }),
      ).toEqual({ label: "schema query-trends", input: "series.0" });
    });

    it("ignores empty-string explicit input and falls back to command args", () => {
      expect(
        getPostHogExecDisplay({
          command: 'call execute-sql {"query":"x"}',
          input: "   ",
        }),
      ).toEqual({ label: "execute-sql", input: '{"query":"x"}' });
    });
  });

  describe("malformed / unsupported", () => {
    it("returns null for unknown verbs", () => {
      expect(getPostHogExecDisplay({ command: "unknown-verb foo" })).toBeNull();
      expect(getPostHogExecDisplay({ command: "list" })).toBeNull();
      expect(getPostHogExecDisplay({ command: "run something" })).toBeNull();
    });

    it("returns null for missing or malformed input", () => {
      expect(getPostHogExecDisplay(undefined)).toBeNull();
      expect(getPostHogExecDisplay(null)).toBeNull();
      expect(getPostHogExecDisplay({})).toBeNull();
      expect(getPostHogExecDisplay({ command: 42 })).toBeNull();
      expect(getPostHogExecDisplay({ command: "" })).toBeNull();
    });

    it("returns null for `call` with no sub-tool", () => {
      expect(getPostHogExecDisplay({ command: "call" })).toBeNull();
      expect(getPostHogExecDisplay({ command: "call   " })).toBeNull();
    });

    it("tolerates leading/trailing whitespace around the verb", () => {
      expect(getPostHogExecDisplay({ command: "  tools  " })).toEqual({
        label: "tools",
        input: undefined,
      });
      expect(
        getPostHogExecDisplay({ command: "  call execute-sql  " }),
      ).toEqual({ label: "execute-sql", input: undefined });
    });
  });
});
