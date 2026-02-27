import type { CacheSnapshot } from "virtua";
import { create } from "zustand";

export interface ScrollState {
  offset: number;
  cache: CacheSnapshot;
}

interface SessionViewState {
  showRawLogs: boolean;
  searchQuery: string;
  showSearch: boolean;
  scrollStates: Record<string, ScrollState>;
}

interface SessionViewActions {
  setShowRawLogs: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSearch: () => void;
  saveScrollState: (taskId: string, state: ScrollState) => void;
  getScrollState: (taskId: string) => ScrollState | undefined;
}

type SessionViewStore = SessionViewState & { actions: SessionViewActions };

const useStore = create<SessionViewStore>((set, get) => ({
  showRawLogs: false,
  searchQuery: "",
  showSearch: false,
  scrollStates: {},
  actions: {
    setShowRawLogs: (show) => set({ showRawLogs: show }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    toggleSearch: () =>
      set((state) => ({
        showSearch: !state.showSearch,
        searchQuery: state.showSearch ? "" : state.searchQuery,
      })),
    saveScrollState: (taskId, scrollState) =>
      set((state) => ({
        scrollStates: { ...state.scrollStates, [taskId]: scrollState },
      })),
    getScrollState: (taskId) => get().scrollStates[taskId],
  },
}));

export const useShowRawLogs = () => useStore((s) => s.showRawLogs);
export const useSearchQuery = () => useStore((s) => s.searchQuery);
export const useShowSearch = () => useStore((s) => s.showSearch);
export const useSessionViewActions = () => useStore((s) => s.actions);
