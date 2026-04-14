import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface ArchivedTasksState {
  // taskId → timestamp (ms) for FIFO ordering
  archivedTasks: Record<string, number>;
  archive: (taskId: string) => void;
  unarchive: (taskId: string) => void;
  isArchived: (taskId: string) => boolean;
}

export const useArchivedTasksStore = create<ArchivedTasksState>()(
  persist(
    (set, get) => ({
      archivedTasks: {},

      archive: (taskId: string) =>
        set((state) => ({
          archivedTasks: {
            ...state.archivedTasks,
            [taskId]: Date.now(),
          },
        })),

      unarchive: (taskId: string) =>
        set((state) => {
          const { [taskId]: _, ...rest } = state.archivedTasks;
          return { archivedTasks: rest };
        }),

      isArchived: (taskId: string) => taskId in get().archivedTasks,
    }),
    {
      name: "archived-tasks",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ archivedTasks: state.archivedTasks }),
    },
  ),
);
