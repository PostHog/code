import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import {
  filterAvailableModes,
  filterModeConfigOptions,
  sanitizeSelectablePermissionMode,
} from "./permissionModes";

function createModeOption(currentValue: string): SessionConfigOption {
  return {
    id: "mode",
    name: "Approval preset",
    type: "select",
    category: "mode",
    currentValue,
    options: [
      { value: "default", name: "Default" },
      { value: "acceptEdits", name: "Accept edits" },
      { value: "plan", name: "Plan mode" },
      { value: "bypassPermissions", name: "Auto-accept permissions" },
    ],
  } as SessionConfigOption;
}

describe("permissionModes", () => {
  it("filters unsafe claude mode when the toggle is disabled", () => {
    expect(
      filterAvailableModes(
        [
          { id: "default", name: "Default", description: "" },
          { id: "acceptEdits", name: "Accept edits", description: "" },
          { id: "plan", name: "Plan mode", description: "" },
          {
            id: "bypassPermissions",
            name: "Auto-accept permissions",
            description: "",
          },
        ],
        "claude",
        false,
      ).map((mode) => mode.id),
    ).toEqual(["default", "acceptEdits", "plan"]);
  });

  it("filters unsafe codex mode when the toggle is disabled", () => {
    expect(
      filterAvailableModes(
        [
          { id: "read-only", name: "Read only", description: "" },
          { id: "auto", name: "Auto", description: "" },
          { id: "full-access", name: "Full access", description: "" },
        ],
        "codex",
        false,
      ).map((mode) => mode.id),
    ).toEqual(["read-only", "auto"]);
  });

  it("preserves unsafe modes when the toggle is enabled", () => {
    expect(
      sanitizeSelectablePermissionMode("bypassPermissions", "claude", true),
    ).toBe(
      "bypassPermissions",
    );
    expect(
      sanitizeSelectablePermissionMode("full-access", "codex", true),
    ).toBe(
      "full-access",
    );
  });

  it("falls back to safe defaults when an unsafe mode is hidden", () => {
    expect(
      sanitizeSelectablePermissionMode("bypassPermissions", "claude", false),
    ).toBe("plan");
    expect(
      sanitizeSelectablePermissionMode("full-access", "codex", false),
    ).toBe("auto");
  });

  it("filters the mode config option without rewriting the current value", () => {
    const [filtered] = filterModeConfigOptions(
      [createModeOption("bypassPermissions")],
      "claude",
      false,
    ) ?? [undefined];

    expect(filtered?.currentValue).toBe("bypassPermissions");
    expect(
      (filtered?.type === "select" ? filtered.options : []).map((option) =>
        "value" in option ? option.value : "",
      ),
    ).toEqual(["default", "acceptEdits", "plan"]);
  });

  it("filters grouped mode options when an unsafe mode is hidden", () => {
    const groupedModeOption = {
      id: "mode",
      name: "Approval preset",
      type: "select",
      category: "mode",
      currentValue: "full-access",
      options: [
        {
          name: "Safe",
          options: [
            { value: "read-only", name: "Read only" },
            { value: "auto", name: "Auto" },
          ],
        },
        {
          name: "Unsafe",
          options: [{ value: "full-access", name: "Full access" }],
        },
      ],
    } as SessionConfigOption;

    const [filtered] = filterModeConfigOptions(
      [groupedModeOption],
      "codex",
      false,
    ) ?? [undefined];

    expect(filtered?.currentValue).toBe("full-access");
    expect(filtered?.type === "select" ? filtered.options : []).toEqual([
      {
        name: "Safe",
        options: [
          { value: "read-only", name: "Read only" },
          { value: "auto", name: "Auto" },
        ],
      },
    ]);
  });
});
