import { beforeEach, describe, expect, it } from "vitest";
import { useUsageLimitStore } from "./usageLimitStore";

describe("usageLimitStore", () => {
  beforeEach(() => {
    useUsageLimitStore.setState({ isOpen: false, context: null });
  });

  it("starts closed with no context", () => {
    const state = useUsageLimitStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.context).toBeNull();
  });

  it("show opens with mid-task context", () => {
    useUsageLimitStore.getState().show("mid-task");
    const state = useUsageLimitStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.context).toBe("mid-task");
  });

  it("show opens with idle context", () => {
    useUsageLimitStore.getState().show("idle");
    const state = useUsageLimitStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.context).toBe("idle");
  });

  it("hide closes but preserves context for exit animation", () => {
    useUsageLimitStore.getState().show("mid-task");
    useUsageLimitStore.getState().hide();
    const state = useUsageLimitStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.context).toBe("mid-task");
  });
});
