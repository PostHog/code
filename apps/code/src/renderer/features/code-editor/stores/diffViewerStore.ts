import { ANALYTICS_EVENTS } from "@shared/types/analytics";
import { track } from "@utils/analytics";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "split" | "unified";

interface DiffViewerStoreState {
  viewMode: ViewMode;
  wordWrap: boolean;
  loadFullFiles: boolean;
  wordDiffs: boolean;
  hideWhitespaceChanges: boolean;
  showReviewComments: boolean;
}

interface DiffViewerStoreActions {
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  toggleWordWrap: () => void;
  toggleLoadFullFiles: () => void;
  toggleWordDiffs: () => void;
  toggleHideWhitespaceChanges: () => void;
  toggleShowReviewComments: () => void;
}

type DiffViewerStore = DiffViewerStoreState & DiffViewerStoreActions;

export const useDiffViewerStore = create<DiffViewerStore>()(
  persist(
    (set) => ({
      viewMode: "unified",
      wordWrap: true,
      loadFullFiles: false,
      wordDiffs: true,
      hideWhitespaceChanges: false,
      showReviewComments: true,
      setViewMode: (mode) =>
        set((state) => {
          if (state.viewMode === mode) {
            return state;
          }

          track(ANALYTICS_EVENTS.DIFF_VIEW_MODE_CHANGED, {
            from_mode: state.viewMode,
            to_mode: mode,
          });

          return { viewMode: mode };
        }),
      toggleViewMode: () =>
        set((state) => {
          const nextMode = state.viewMode === "split" ? "unified" : "split";

          track(ANALYTICS_EVENTS.DIFF_VIEW_MODE_CHANGED, {
            from_mode: state.viewMode,
            to_mode: nextMode,
          });

          return {
            viewMode: nextMode,
          };
        }),
      toggleWordWrap: () => set((s) => ({ wordWrap: !s.wordWrap })),
      toggleLoadFullFiles: () =>
        set((s) => ({ loadFullFiles: !s.loadFullFiles })),
      toggleWordDiffs: () => set((s) => ({ wordDiffs: !s.wordDiffs })),
      toggleHideWhitespaceChanges: () =>
        set((s) => ({ hideWhitespaceChanges: !s.hideWhitespaceChanges })),
      toggleShowReviewComments: () =>
        set((s) => ({ showReviewComments: !s.showReviewComments })),
    }),
    {
      name: "diff-viewer-storage",
    },
  ),
);
