import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMcpToolMetadataCache,
  getMcpToolApprovalState,
  getMcpToolMetadata,
  isMcpToolReadOnly,
  setMcpToolApprovalStates,
} from "./tool-metadata";

describe("tool-metadata approval states", () => {
  beforeEach(() => {
    clearMcpToolMetadataCache();
  });

  describe("setMcpToolApprovalStates", () => {
    it("creates entries for unknown tools", () => {
      setMcpToolApprovalStates({
        mcp__server__tool1: "approved",
        mcp__server__tool2: "do_not_use",
      });

      expect(getMcpToolApprovalState("mcp__server__tool1")).toBe("approved");
      expect(getMcpToolApprovalState("mcp__server__tool2")).toBe("do_not_use");

      const meta = getMcpToolMetadata("mcp__server__tool1");
      expect(meta).toBeDefined();
      expect(meta?.readOnly).toBe(false);
    });

    it("merges with existing entries preserving readOnly", () => {
      setMcpToolApprovalStates({
        mcp__server__ro_tool: "needs_approval",
      });

      const before = getMcpToolMetadata("mcp__server__ro_tool");
      expect(before?.readOnly).toBe(false);
      expect(before?.approvalState).toBe("needs_approval");
    });

    it("updates approval state on existing entries without overwriting other fields", () => {
      setMcpToolApprovalStates({
        mcp__server__tool: "approved",
      });

      setMcpToolApprovalStates({
        mcp__server__tool: "do_not_use",
      });

      expect(getMcpToolApprovalState("mcp__server__tool")).toBe("do_not_use");
    });
  });

  describe("getMcpToolApprovalState", () => {
    it("returns undefined for unknown tools", () => {
      expect(getMcpToolApprovalState("mcp__server__unknown")).toBeUndefined();
    });

    it("returns the correct state", () => {
      setMcpToolApprovalStates({
        mcp__s__t: "needs_approval",
      });
      expect(getMcpToolApprovalState("mcp__s__t")).toBe("needs_approval");
    });
  });

  describe("isMcpToolReadOnly with approval states", () => {
    it("returns false for tools that only have approval state", () => {
      setMcpToolApprovalStates({
        mcp__server__tool: "approved",
      });
      expect(isMcpToolReadOnly("mcp__server__tool")).toBe(false);
    });
  });
});
