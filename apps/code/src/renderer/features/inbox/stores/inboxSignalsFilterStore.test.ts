import { beforeEach, describe, expect, it } from "vitest";
import { useInboxSignalsFilterStore } from "./inboxSignalsFilterStore";

describe("inboxSignalsFilterStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useInboxSignalsFilterStore.setState({
      sortField: "total_weight",
      sortDirection: "desc",
      searchQuery: "",
    });
  });

  it("has correct defaults", () => {
    const state = useInboxSignalsFilterStore.getState();
    expect(state.sortField).toBe("total_weight");
    expect(state.sortDirection).toBe("desc");
    expect(state.searchQuery).toBe("");
  });

  it("setSort updates field and direction", () => {
    useInboxSignalsFilterStore.getState().setSort("created_at", "asc");
    const state = useInboxSignalsFilterStore.getState();
    expect(state.sortField).toBe("created_at");
    expect(state.sortDirection).toBe("asc");
  });

  it("setSearchQuery updates query", () => {
    useInboxSignalsFilterStore.getState().setSearchQuery("login error");
    expect(useInboxSignalsFilterStore.getState().searchQuery).toBe(
      "login error",
    );
  });

  it("persists sortField and sortDirection", () => {
    useInboxSignalsFilterStore.getState().setSort("created_at", "desc");
    const raw = localStorage.getItem("inbox-signals-filter-storage");
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw as string);
    expect(persisted.state.sortField).toBe("created_at");
    expect(persisted.state.sortDirection).toBe("desc");
  });

  it("does not persist searchQuery", () => {
    useInboxSignalsFilterStore.getState().setSearchQuery("test");
    const raw = localStorage.getItem("inbox-signals-filter-storage");
    expect(raw).toBeTruthy();
    const persisted = JSON.parse(raw as string);
    expect(persisted.state.searchQuery).toBeUndefined();
  });
});
