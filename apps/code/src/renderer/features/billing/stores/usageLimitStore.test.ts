import { beforeEach, describe, expect, it } from "vitest";
import { useUsageLimitStore } from "./usageLimitStore";

describe("usageLimitStore", () => {
  beforeEach(() => {
    useUsageLimitStore.setState({ isOpen: false });
  });

  it("starts closed", () => {
    const state = useUsageLimitStore.getState();
    expect(state.isOpen).toBe(false);
  });

  it("show opens the modal", () => {
    useUsageLimitStore.getState().show();
    expect(useUsageLimitStore.getState().isOpen).toBe(true);
  });

  it("hide closes the modal", () => {
    useUsageLimitStore.getState().show();
    useUsageLimitStore.getState().hide();
    expect(useUsageLimitStore.getState().isOpen).toBe(false);
  });
});
