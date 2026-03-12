import { createJSONStorage, type StateStorage } from "zustand/middleware";
import { trpcClient } from "../trpc";

/**
 * Raw storage adapter that uses electron to persist state.
 */
const electronStorageRaw: StateStorage = {
  getItem: async (key: string): Promise<string | null> => {
    return await trpcClient.secureStore.getItem.query({ key });
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await trpcClient.secureStore.setItem.query({ key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    await trpcClient.secureStore.removeItem.query({ key });
  },
};

export const electronStorage = createJSONStorage(() => electronStorageRaw);
