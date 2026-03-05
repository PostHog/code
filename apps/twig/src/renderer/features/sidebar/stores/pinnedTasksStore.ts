import { trpcVanilla } from "@renderer/trpc";
import { logger } from "@utils/logger";
import { create } from "zustand";

const log = logger.scope("pinned-tasks-store");

interface PinnedTasksState {
  pinnedTaskIds: Set<string>;
  isLoaded: boolean;
  togglePin: (taskId: string) => Promise<void>;
  unpin: (taskId: string) => Promise<void>;
  isPinned: (taskId: string) => boolean;
  loadPinnedTasks: () => Promise<void>;
}

export const usePinnedTasksStore = create<PinnedTasksState>()((set, get) => {
  (async () => {
    try {
      const pinnedIds = await trpcVanilla.workspace.getPinnedTaskIds.query();
      set({ pinnedTaskIds: new Set(pinnedIds), isLoaded: true });
    } catch (error) {
      log.error("Failed to load pinned tasks:", error);
      set({ isLoaded: true });
    }
  })();

  return {
    pinnedTaskIds: new Set<string>(),
    isLoaded: false,

    togglePin: async (taskId: string) => {
      const wasPinned = get().pinnedTaskIds.has(taskId);
      set((state) => {
        const newPinnedTaskIds = new Set(state.pinnedTaskIds);
        if (wasPinned) {
          newPinnedTaskIds.delete(taskId);
        } else {
          newPinnedTaskIds.add(taskId);
        }
        return { pinnedTaskIds: newPinnedTaskIds };
      });

      try {
        const result = await trpcVanilla.workspace.togglePin.mutate({ taskId });
        set((state) => {
          const newPinnedTaskIds = new Set(state.pinnedTaskIds);
          if (result.isPinned) {
            newPinnedTaskIds.add(taskId);
          } else {
            newPinnedTaskIds.delete(taskId);
          }
          return { pinnedTaskIds: newPinnedTaskIds };
        });
      } catch (error) {
        log.error("Failed to toggle pin:", error);
        set((state) => {
          const newPinnedTaskIds = new Set(state.pinnedTaskIds);
          if (wasPinned) {
            newPinnedTaskIds.add(taskId);
          } else {
            newPinnedTaskIds.delete(taskId);
          }
          return { pinnedTaskIds: newPinnedTaskIds };
        });
      }
    },

    unpin: async (taskId: string) => {
      if (!get().pinnedTaskIds.has(taskId)) return;

      set((state) => {
        const newPinnedTaskIds = new Set(state.pinnedTaskIds);
        newPinnedTaskIds.delete(taskId);
        return { pinnedTaskIds: newPinnedTaskIds };
      });

      try {
        const result = await trpcVanilla.workspace.togglePin.mutate({ taskId });
        if (result.isPinned) {
          await trpcVanilla.workspace.togglePin.mutate({ taskId });
        }
      } catch (error) {
        log.error("Failed to unpin task:", error);
        set((state) => {
          const newPinnedTaskIds = new Set(state.pinnedTaskIds);
          newPinnedTaskIds.add(taskId);
          return { pinnedTaskIds: newPinnedTaskIds };
        });
      }
    },

    isPinned: (taskId: string) => get().pinnedTaskIds.has(taskId),

    loadPinnedTasks: async () => {
      try {
        const pinnedIds = await trpcVanilla.workspace.getPinnedTaskIds.query();
        set({ pinnedTaskIds: new Set(pinnedIds), isLoaded: true });
      } catch (error) {
        log.error("Failed to load pinned tasks:", error);
        set({ isLoaded: true });
      }
    },
  };
});
