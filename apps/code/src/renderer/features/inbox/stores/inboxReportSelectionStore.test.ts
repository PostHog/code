import { beforeEach, describe, expect, it } from "vitest";
import { useInboxReportSelectionStore } from "./inboxReportSelectionStore";

describe("inboxReportSelectionStore", () => {
  beforeEach(() => {
    useInboxReportSelectionStore.setState({
      selectedReportIds: [],
    });
  });

  it("starts empty", () => {
    expect(useInboxReportSelectionStore.getState().selectedReportIds).toEqual(
      [],
    );
  });

  it("setSelectedReportIds de-duplicates ids", () => {
    useInboxReportSelectionStore
      .getState()
      .setSelectedReportIds(["r1", "r2", "r1", "r3", "r2"]);

    expect(useInboxReportSelectionStore.getState().selectedReportIds).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
  });

  it("toggleReportSelection adds an unselected report", () => {
    useInboxReportSelectionStore.getState().toggleReportSelection("r1");

    expect(useInboxReportSelectionStore.getState().selectedReportIds).toEqual([
      "r1",
    ]);
  });

  it("toggleReportSelection removes a selected report", () => {
    useInboxReportSelectionStore.setState({
      selectedReportIds: ["r1", "r2"],
    });

    useInboxReportSelectionStore.getState().toggleReportSelection("r1");

    expect(useInboxReportSelectionStore.getState().selectedReportIds).toEqual([
      "r2",
    ]);
  });

  it("isReportSelected reflects selection state", () => {
    useInboxReportSelectionStore.setState({
      selectedReportIds: ["r2"],
    });

    expect(useInboxReportSelectionStore.getState().isReportSelected("r1")).toBe(
      false,
    );
    expect(useInboxReportSelectionStore.getState().isReportSelected("r2")).toBe(
      true,
    );
  });

  it("clearSelection clears all selected reports", () => {
    useInboxReportSelectionStore.setState({
      selectedReportIds: ["r1", "r2"],
    });

    useInboxReportSelectionStore.getState().clearSelection();

    expect(useInboxReportSelectionStore.getState().selectedReportIds).toEqual(
      [],
    );
  });

  it("pruneSelection keeps only visible report ids", () => {
    useInboxReportSelectionStore.setState({
      selectedReportIds: ["r1", "r2", "r3"],
    });

    useInboxReportSelectionStore.getState().pruneSelection(["r2", "r4"]);

    expect(useInboxReportSelectionStore.getState().selectedReportIds).toEqual([
      "r2",
    ]);
  });
});
