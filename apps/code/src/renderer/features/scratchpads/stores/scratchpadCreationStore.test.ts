import { beforeEach, describe, expect, it } from "vitest";
import { useScratchpadCreationStore } from "./scratchpadCreationStore";

describe("scratchpadCreationStore", () => {
  beforeEach(() => {
    useScratchpadCreationStore.getState().reset();
  });

  it("has the expected initial state", () => {
    const state = useScratchpadCreationStore.getState();
    expect(state.open).toBe(false);
    expect(state.step).toBe("idle");
    expect(state.lastError).toBeNull();
  });

  it("openDialog sets open=true and clears any prior error", () => {
    useScratchpadCreationStore.setState({
      lastError: "old",
      step: "submitting",
    });
    useScratchpadCreationStore.getState().openDialog();
    const state = useScratchpadCreationStore.getState();
    expect(state.open).toBe(true);
    expect(state.lastError).toBeNull();
    expect(state.step).toBe("idle");
  });

  it("closeDialog only flips open=false (preserves other state)", () => {
    useScratchpadCreationStore.setState({
      open: true,
      step: "submitting",
      lastError: "boom",
    });
    useScratchpadCreationStore.getState().closeDialog();
    const state = useScratchpadCreationStore.getState();
    expect(state.open).toBe(false);
    expect(state.step).toBe("submitting");
    expect(state.lastError).toBe("boom");
  });

  it("setStep updates the step", () => {
    useScratchpadCreationStore.getState().setStep("submitting");
    expect(useScratchpadCreationStore.getState().step).toBe("submitting");
    useScratchpadCreationStore.getState().setStep("idle");
    expect(useScratchpadCreationStore.getState().step).toBe("idle");
  });

  it("setError stores and clears the error", () => {
    useScratchpadCreationStore.getState().setError("nope");
    expect(useScratchpadCreationStore.getState().lastError).toBe("nope");
    useScratchpadCreationStore.getState().setError(null);
    expect(useScratchpadCreationStore.getState().lastError).toBeNull();
  });

  it("reset returns to initial state", () => {
    useScratchpadCreationStore.setState({
      open: true,
      step: "submitting",
      lastError: "err",
    });
    useScratchpadCreationStore.getState().reset();
    const state = useScratchpadCreationStore.getState();
    expect(state.open).toBe(false);
    expect(state.step).toBe("idle");
    expect(state.lastError).toBeNull();
  });
});
