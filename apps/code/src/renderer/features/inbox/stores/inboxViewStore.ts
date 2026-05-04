import { create } from "zustand";
import { persist } from "zustand/middleware";

export type InboxTab = "pull-requests" | "reports";
export type InboxScope = "for-you" | "all";
export type InboxSort = "priority" | "recent";

interface InboxViewState {
  activeTab: InboxTab;
  scope: InboxScope;
  sort: InboxSort;
  dismissedIds: string[];
}

interface InboxViewActions {
  setActiveTab: (tab: InboxTab) => void;
  setScope: (scope: InboxScope) => void;
  setSort: (sort: InboxSort) => void;
  dismiss: (id: string) => void;
  undismiss: (id: string) => void;
}

type InboxViewStore = InboxViewState & InboxViewActions;

export const useInboxViewStore = create<InboxViewStore>()(
  persist(
    (set) => ({
      activeTab: "reports",
      scope: "all",
      sort: "priority",
      dismissedIds: [],
      setActiveTab: (activeTab) => set({ activeTab }),
      setScope: (scope) => set({ scope }),
      setSort: (sort) => set({ sort }),
      dismiss: (id) =>
        set((state) => ({
          dismissedIds: state.dismissedIds.includes(id)
            ? state.dismissedIds
            : [...state.dismissedIds, id],
        })),
      undismiss: (id) =>
        set((state) => ({
          dismissedIds: state.dismissedIds.filter((d) => d !== id),
        })),
    }),
    {
      name: "inbox-view-storage",
      partialize: (state) => ({
        activeTab: state.activeTab,
        scope: state.scope,
        sort: state.sort,
      }),
    },
  ),
);
