import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ViewMode = "split" | "unified";

interface DiffViewerStoreState {
  viewMode: ViewMode;
  wordWrap: boolean;
  loadFullFiles: boolean;
  wordDiffs: boolean;
  hideWhitespaceChanges: boolean;
}

interface DiffViewerStoreActions {
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
  toggleWordWrap: () => void;
  toggleLoadFullFiles: () => void;
  toggleWordDiffs: () => void;
  toggleHideWhitespaceChanges: () => void;
}

type DiffViewerStore = DiffViewerStoreState & DiffViewerStoreActions;

export const useDiffViewerStore = create<DiffViewerStore>()(
  persist(
    (set) => ({
      viewMode: "unified",
      wordWrap: true,
      loadFullFiles: false,
      wordDiffs: false,
      hideWhitespaceChanges: false,
      setViewMode: (mode) => set({ viewMode: mode }),
      toggleViewMode: () =>
        set((s) => ({
          viewMode: s.viewMode === "split" ? "unified" : "split",
        })),
      toggleWordWrap: () => set((s) => ({ wordWrap: !s.wordWrap })),
      toggleLoadFullFiles: () =>
        set((s) => ({ loadFullFiles: !s.loadFullFiles })),
      toggleWordDiffs: () => set((s) => ({ wordDiffs: !s.wordDiffs })),
      toggleHideWhitespaceChanges: () =>
        set((s) => ({ hideWhitespaceChanges: !s.hideWhitespaceChanges })),
    }),
    {
      name: "diff-viewer-storage",
    },
  ),
);
