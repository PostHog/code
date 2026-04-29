import { describe, expect, it } from "vitest";
import { buildExitPlanModePermissionOptions } from "./permission-options";

describe("buildExitPlanModePermissionOptions", () => {
  it("does not relabel any option when no previous mode is provided", () => {
    const options = buildExitPlanModePermissionOptions();
    for (const opt of options) {
      expect(opt.name).not.toMatch(/^Yes, continue/);
    }
    expect(options[options.length - 1].optionId).toBe("reject_with_feedback");
  });

  it("promotes the previous mode to the first position with a continue label", () => {
    const options = buildExitPlanModePermissionOptions("default");
    expect(options[0]).toMatchObject({
      optionId: "default",
      name: "Yes, continue manually approving edits",
    });
    expect(options[options.length - 1].optionId).toBe("reject_with_feedback");
  });

  it("relabels the auto option when it is the previous mode", () => {
    const options = buildExitPlanModePermissionOptions("auto");
    expect(options[0]).toMatchObject({
      optionId: "auto",
      name: 'Yes, continue in "auto" mode',
    });
  });

  it("relabels the acceptEdits option when it is the previous mode", () => {
    const options = buildExitPlanModePermissionOptions("acceptEdits");
    expect(options[0]).toMatchObject({
      optionId: "acceptEdits",
      name: "Yes, continue auto-accepting edits",
    });
  });

  it("ignores an unknown previous mode", () => {
    const options = buildExitPlanModePermissionOptions("plan");
    expect(options[0].name).toMatch(/^Yes, /);
    expect(options[0].name).not.toMatch(/^Yes, continue/);
    expect(options[options.length - 1].optionId).toBe("reject_with_feedback");
  });

  it("always keeps the reject option last", () => {
    for (const previousMode of ["auto", "acceptEdits", "default", undefined]) {
      const options = buildExitPlanModePermissionOptions(previousMode);
      expect(options[options.length - 1].optionId).toBe("reject_with_feedback");
    }
  });
});
