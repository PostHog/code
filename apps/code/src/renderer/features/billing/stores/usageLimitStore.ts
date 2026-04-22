import { create } from "zustand";

type UsageLimitContext = "mid-task" | "idle";

interface UsageLimitState {
  isOpen: boolean;
  context: UsageLimitContext | null;
}

interface UsageLimitActions {
  show: (context: UsageLimitContext) => void;
  hide: () => void;
}

type UsageLimitStore = UsageLimitState & UsageLimitActions;

export const useUsageLimitStore = create<UsageLimitStore>()((set) => ({
  isOpen: false,
  context: null,

  show: (context) => set({ isOpen: true, context }),
  hide: () => set({ isOpen: false }),
}));
