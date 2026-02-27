import type { SignalReportOrderingField } from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type SignalSortField = Extract<
  SignalReportOrderingField,
  "created_at" | "total_weight"
>;

type SignalSortDirection = "asc" | "desc";

interface InboxSignalsFilterState {
  sortField: SignalSortField;
  sortDirection: SignalSortDirection;
  searchQuery: string;
}

interface InboxSignalsFilterActions {
  setSort: (field: SignalSortField, direction: SignalSortDirection) => void;
  setSearchQuery: (query: string) => void;
}

type InboxSignalsFilterStore = InboxSignalsFilterState &
  InboxSignalsFilterActions;

export const useInboxSignalsFilterStore = create<InboxSignalsFilterStore>()(
  persist(
    (set) => ({
      sortField: "total_weight",
      sortDirection: "desc",
      searchQuery: "",
      setSort: (sortField, sortDirection) => set({ sortField, sortDirection }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: "inbox-signals-filter-storage",
      partialize: (state) => ({
        sortField: state.sortField,
        sortDirection: state.sortDirection,
      }),
    },
  ),
);
