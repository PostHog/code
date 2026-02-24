import { create } from "zustand";

export interface ScrollAnchor {
  index: number;
  offsetFromTop: number;
}

interface SessionViewState {
  showRawLogs: boolean;
  searchQuery: string;
  showSearch: boolean;
  scrollAnchors: Record<string, ScrollAnchor>;
}

interface SessionViewActions {
  setShowRawLogs: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  toggleSearch: () => void;
  saveScrollAnchor: (taskId: string, anchor: ScrollAnchor) => void;
  getScrollAnchor: (taskId: string) => ScrollAnchor | null;
}

type SessionViewStore = SessionViewState & { actions: SessionViewActions };

const useStore = create<SessionViewStore>((set, get) => ({
  showRawLogs: false,
  searchQuery: "",
  showSearch: false,
  scrollAnchors: {},
  actions: {
    setShowRawLogs: (show) => set({ showRawLogs: show }),
    setSearchQuery: (query) => set({ searchQuery: query }),
    toggleSearch: () =>
      set((state) => ({
        showSearch: !state.showSearch,
        searchQuery: state.showSearch ? "" : state.searchQuery,
      })),
    saveScrollAnchor: (taskId, anchor) =>
      set((state) => ({
        scrollAnchors: { ...state.scrollAnchors, [taskId]: anchor },
      })),
    getScrollAnchor: (taskId) => get().scrollAnchors[taskId] ?? null,
  },
}));

export const useShowRawLogs = () => useStore((s) => s.showRawLogs);
export const useSearchQuery = () => useStore((s) => s.searchQuery);
export const useShowSearch = () => useStore((s) => s.showSearch);
export const useSessionViewActions = () => useStore((s) => s.actions);
