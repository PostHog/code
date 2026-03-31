import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MarkdownViewerStoreState {
  preferRendered: boolean;
}

interface MarkdownViewerStoreActions {
  togglePreferRendered: () => void;
}

type MarkdownViewerStore = MarkdownViewerStoreState &
  MarkdownViewerStoreActions;

export const useMarkdownViewerStore = create<MarkdownViewerStore>()(
  persist(
    (set) => ({
      preferRendered: true,
      togglePreferRendered: () =>
        set((s) => ({ preferRendered: !s.preferRendered })),
    }),
    {
      name: "markdown-viewer-storage",
    },
  ),
);
