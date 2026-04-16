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

describe("cycleModeOption", () => {
  it("cycles through auto-accept permissions for claude", () => {
    const option = createModeOption("plan", [
      "default",
      "acceptEdits",
      "plan",
      "bypassPermissions",
    ]);

    expect(cycleModeOption(option)).toBe("bypassPermissions");
  });

  it("cycles through full access for codex", () => {
    const option = createModeOption("auto", [
      "read-only",
      "auto",
      "full-access",
    ]);

    expect(cycleModeOption(option)).toBe("full-access");
  });
});
