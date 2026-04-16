import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TaskInputHistoryState {
  prompts: string[];
}

interface TaskInputHistoryActions {
  addPrompt: (prompt: string) => void;
}

type TaskInputHistoryStore = TaskInputHistoryState & TaskInputHistoryActions;

const MAX_HISTORY = 15;

export const useTaskInputHistoryStore = create<TaskInputHistoryStore>()(
  persist(
    (set) => ({
      prompts: [],
      addPrompt: (prompt) =>
        set((state) => {
          const trimmed = prompt.trim();
          if (!trimmed) return state;
          const filtered = state.prompts.filter((p) => p !== trimmed);
          const updated = [...filtered, trimmed].slice(-MAX_HISTORY);
          return { prompts: updated };
        }),
    }),
    {
      name: "task-input-history",
      partialize: (state) => ({ prompts: state.prompts }),
    },
  ),
);
