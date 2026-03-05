import { trpcVanilla } from "@renderer/trpc";
import { logger } from "@utils/logger";
import { create } from "zustand";

const log = logger.scope("task-viewed-store");

interface TaskTimestamps {
  lastViewedAt: number | null;
  lastActivityAt: number | null;
}

interface TaskViewedState {
  timestamps: Record<string, TaskTimestamps>;
  isLoaded: boolean;
}

interface TaskViewedActions {
  markAsViewed: (taskId: string) => void;
  getLastViewedAt: (taskId: string) => number | undefined;
  markActivity: (taskId: string) => void;
  getLastActivityAt: (taskId: string) => number | undefined;
  loadTimestamps: () => Promise<void>;
}

type TaskViewedStore = TaskViewedState & TaskViewedActions;

export const useTaskViewedStore = create<TaskViewedStore>()((set, get) => {
  (async () => {
    try {
      const allTimestamps =
        await trpcVanilla.workspace.getAllTaskTimestamps.query();
      const timestamps: Record<string, TaskTimestamps> = {};
      for (const [taskId, ts] of Object.entries(allTimestamps)) {
        timestamps[taskId] = {
          lastViewedAt: ts.lastViewedAt
            ? new Date(ts.lastViewedAt).getTime()
            : null,
          lastActivityAt: ts.lastActivityAt
            ? new Date(ts.lastActivityAt).getTime()
            : null,
        };
      }
      set({ timestamps, isLoaded: true });
    } catch (error) {
      log.error("Failed to load task timestamps:", error);
      set({ isLoaded: true });
    }
  })();

  return {
    timestamps: {},
    isLoaded: false,

    markAsViewed: (taskId: string) => {
      const now = Date.now();
      set((state) => ({
        timestamps: {
          ...state.timestamps,
          [taskId]: {
            ...state.timestamps[taskId],
            lastViewedAt: now,
          },
        },
      }));

      trpcVanilla.workspace.markViewed.mutate({ taskId }).catch((error) => {
        log.error("Failed to mark task as viewed:", error);
      });
    },

    getLastViewedAt: (taskId: string) => {
      return get().timestamps[taskId]?.lastViewedAt ?? undefined;
    },

    markActivity: (taskId: string) => {
      const currentViewed = get().timestamps[taskId]?.lastViewedAt ?? 0;
      const now = Date.now();
      const activityTime = Math.max(now, currentViewed + 1);

      set((state) => ({
        timestamps: {
          ...state.timestamps,
          [taskId]: {
            ...state.timestamps[taskId],
            lastActivityAt: activityTime,
          },
        },
      }));

      trpcVanilla.workspace.markActivity.mutate({ taskId }).catch((error) => {
        log.error("Failed to mark task activity:", error);
      });
    },

    getLastActivityAt: (taskId: string) => {
      return get().timestamps[taskId]?.lastActivityAt ?? undefined;
    },

    loadTimestamps: async () => {
      try {
        const allTimestamps =
          await trpcVanilla.workspace.getAllTaskTimestamps.query();
        const timestamps: Record<string, TaskTimestamps> = {};
        for (const [taskId, ts] of Object.entries(allTimestamps)) {
          timestamps[taskId] = {
            lastViewedAt: ts.lastViewedAt
              ? new Date(ts.lastViewedAt).getTime()
              : null,
            lastActivityAt: ts.lastActivityAt
              ? new Date(ts.lastActivityAt).getTime()
              : null,
          };
        }
        set({ timestamps, isLoaded: true });
      } catch (error) {
        log.error("Failed to load task timestamps:", error);
        set({ isLoaded: true });
      }
    },
  };
});
