import { create } from "zustand";

interface ReviewNavigationStoreState {
  activeFilePaths: Record<string, string | null>;
  scrollRequests: Record<string, string | null>;
}

interface ReviewNavigationStoreActions {
  setActiveFilePath: (taskId: string, path: string | null) => void;
  requestScrollToFile: (taskId: string, path: string) => void;
  clearScrollRequest: (taskId: string) => void;
  clearTask: (taskId: string) => void;
}

type ReviewNavigationStore = ReviewNavigationStoreState &
  ReviewNavigationStoreActions;

export const useReviewNavigationStore = create<ReviewNavigationStore>()(
  (set) => ({
    activeFilePaths: {},
    scrollRequests: {},

    setActiveFilePath: (taskId, path) =>
      set((state) => ({
        activeFilePaths: { ...state.activeFilePaths, [taskId]: path },
      })),

    requestScrollToFile: (taskId, path) =>
      set((state) => ({
        scrollRequests: { ...state.scrollRequests, [taskId]: path },
      })),

    clearScrollRequest: (taskId) =>
      set((state) => ({
        scrollRequests: { ...state.scrollRequests, [taskId]: null },
      })),

    clearTask: (taskId) =>
      set((state) => ({
        activeFilePaths: { ...state.activeFilePaths, [taskId]: null },
        scrollRequests: { ...state.scrollRequests, [taskId]: null },
      })),
  }),
);
