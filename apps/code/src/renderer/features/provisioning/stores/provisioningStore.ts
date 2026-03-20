import { create } from "zustand";

interface ProvisioningStoreState {
  activeTasks: Set<string>;
}

interface ProvisioningStoreActions {
  setActive: (taskId: string) => void;
  clear: (taskId: string) => void;
  isActive: (taskId: string) => boolean;
}

type ProvisioningStore = ProvisioningStoreState & ProvisioningStoreActions;

export const useProvisioningStore = create<ProvisioningStore>()((set, get) => ({
  activeTasks: new Set(),

  setActive: (taskId) =>
    set((state) => {
      const next = new Set(state.activeTasks);
      next.add(taskId);
      return { activeTasks: next };
    }),

  clear: (taskId) =>
    set((state) => {
      const next = new Set(state.activeTasks);
      next.delete(taskId);
      return { activeTasks: next };
    }),

  isActive: (taskId) => get().activeTasks.has(taskId),
}));
