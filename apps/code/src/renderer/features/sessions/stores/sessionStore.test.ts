import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { cycleModeOption } from "./sessionStore";

function createModeOption(
  currentValue: string,
  values: string[],
): SessionConfigOption {
  return {
    id: "mode",
    name: "Approval Preset",
    type: "select",
    category: "mode",
    currentValue,
    options: values.map((value) => ({
      value,
      name: value,
    })),
  } as SessionConfigOption;
}

const CLAUDE_MODES = ["default", "acceptEdits", "plan", "bypassPermissions"];
const CODEX_MODES = ["read-only", "auto", "full-access"];

describe("cycleModeOption", () => {
  it.each([
    {
      name: "claude: advances to next mode when bypass allowed",
      values: CLAUDE_MODES,
      currentValue: "plan",
      allowBypassPermissions: true,
      expected: "bypassPermissions",
    },
    {
      name: "codex: advances to next mode when bypass allowed",
      values: CODEX_MODES,
      currentValue: "auto",
      allowBypassPermissions: true,
      expected: "full-access",
    },
    {
      name: "claude: skips bypassPermissions when not allowed",
      values: CLAUDE_MODES,
      currentValue: "acceptEdits",
      allowBypassPermissions: false,
      expected: "plan",
    },
    {
      name: "claude: wraps past bypassPermissions back to default",
      values: CLAUDE_MODES,
      currentValue: "plan",
      allowBypassPermissions: false,
      expected: "default",
    },
    {
      name: "codex: skips full-access when not allowed",
      values: CODEX_MODES,
      currentValue: "auto",
      allowBypassPermissions: false,
      expected: "read-only",
    },
  ])("$name", ({ values, currentValue, allowBypassPermissions, expected }) => {
    const option = createModeOption(currentValue, values);

    expect(cycleModeOption(option, { allowBypassPermissions })).toBe(expected);
  });
});
