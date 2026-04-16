import { describe, expect, it } from "vitest";
import { getAvailableCodexModes, getAvailableModes } from "./execution-mode";

describe("execution modes", () => {
  it("includes auto-accept permissions for claude sessions", () => {
    expect(getAvailableModes().map((mode) => mode.id)).toEqual([
      "default",
      "acceptEdits",
      "plan",
      "bypassPermissions",
    ]);
  });

  it("includes full access for codex sessions", () => {
    expect(getAvailableCodexModes().map((mode) => mode.id)).toEqual([
      "read-only",
      "auto",
      "full-access",
    ]);
  });
});
