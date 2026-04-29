import { create } from "zustand";

interface UsageLimitState {
  isOpen: boolean;
}

interface UsageLimitActions {
  show: () => void;
  hide: () => void;
}

type UsageLimitStore = UsageLimitState & UsageLimitActions;

export const useUsageLimitStore = create<UsageLimitStore>()((set) => ({
  isOpen: false,

  show: () => set({ isOpen: true }),
  hide: () => set({ isOpen: false }),
}));
