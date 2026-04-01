import type {
  SignalReportOrderingField,
  SignalReportStatus,
} from "@shared/types";
import { create } from "zustand";
import { persist } from "zustand/middleware";

type SignalSortField = Extract<
  SignalReportOrderingField,
  "priority" | "created_at" | "total_weight"
>;

type SignalSortDirection = "asc" | "desc";

const DEFAULT_STATUS_FILTER: SignalReportStatus[] = [
  "ready",
  "pending_input",
  "in_progress",
  "candidate",
  "potential",
];

interface InboxSignalsFilterState {
  sortField: SignalSortField;
  sortDirection: SignalSortDirection;
  searchQuery: string;
  statusFilter: SignalReportStatus[];
}

interface InboxSignalsFilterActions {
  setSort: (field: SignalSortField, direction: SignalSortDirection) => void;
  setSearchQuery: (query: string) => void;
  setStatusFilter: (statuses: SignalReportStatus[]) => void;
  toggleStatus: (status: SignalReportStatus) => void;
}

type InboxSignalsFilterStore = InboxSignalsFilterState &
  InboxSignalsFilterActions;

export const useInboxSignalsFilterStore = create<InboxSignalsFilterStore>()(
  persist(
    (set) => ({
      sortField: "priority",
      sortDirection: "asc",
      searchQuery: "",
      statusFilter: DEFAULT_STATUS_FILTER,
      setSort: (sortField, sortDirection) => set({ sortField, sortDirection }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
      setStatusFilter: (statusFilter) => set({ statusFilter }),
      toggleStatus: (status) =>
        set((state) => {
          const current = state.statusFilter;
          const next = current.includes(status)
            ? current.filter((s) => s !== status)
            : [...current, status];
          return { statusFilter: next.length > 0 ? next : current };
        }),
    }),
    {
      name: "inbox-signals-filter-storage",
      partialize: (state) => ({
        sortField: state.sortField,
        sortDirection: state.sortDirection,
        statusFilter: state.statusFilter,
      }),
    },
  ),
);
