import { create } from "zustand";

interface InboxReportSelectionState {
  selectedReportIds: string[];
}

interface InboxReportSelectionActions {
  setSelectedReportIds: (reportIds: string[]) => void;
  toggleReportSelection: (reportId: string) => void;
  isReportSelected: (reportId: string) => boolean;
  clearSelection: () => void;
  pruneSelection: (visibleReportIds: string[]) => void;
}

type InboxReportSelectionStore = InboxReportSelectionState &
  InboxReportSelectionActions;

export const useInboxReportSelectionStore = create<InboxReportSelectionStore>()(
  (set, get) => ({
    selectedReportIds: [],
    setSelectedReportIds: (reportIds) =>
      set({ selectedReportIds: Array.from(new Set(reportIds)) }),
    toggleReportSelection: (reportId) =>
      set((state) => ({
        selectedReportIds: state.selectedReportIds.includes(reportId)
          ? state.selectedReportIds.filter((id) => id !== reportId)
          : [...state.selectedReportIds, reportId],
      })),
    isReportSelected: (reportId) => get().selectedReportIds.includes(reportId),
    clearSelection: () => set({ selectedReportIds: [] }),
    pruneSelection: (visibleReportIds) => {
      const visibleIds = new Set(visibleReportIds);
      set((state) => ({
        selectedReportIds: state.selectedReportIds.filter((id) =>
          visibleIds.has(id),
        ),
      }));
    },
  }),
);
