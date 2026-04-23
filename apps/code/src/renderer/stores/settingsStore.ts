import { logger } from "@utils/logger";
import { create } from "zustand";
import { trpcClient } from "../trpc";

const log = logger.scope("settings-store");

export type SendMessagesWith = "enter" | "cmd+enter";

interface SettingsState {
  sendMessagesWith: SendMessagesWith;
  loadSendMessagesWith: () => Promise<void>;
  setSendMessagesWith: (mode: SendMessagesWith) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  sendMessagesWith: "enter",

  loadSendMessagesWith: async () => {
    try {
      const mode = await trpcClient.secureStore.getItem.query({
        key: "sendMessagesWith",
      });
      if (mode === "enter" || mode === "cmd+enter") {
        set({ sendMessagesWith: mode });
      }
    } catch (error) {
      log.warn("Failed to load sendMessagesWith preference", { error });
    }
  },

  setSendMessagesWith: async (mode: SendMessagesWith) => {
    try {
      await trpcClient.secureStore.setItem.query({
        key: "sendMessagesWith",
        value: mode,
      });
      set({ sendMessagesWith: mode });
    } catch (error) {
      log.warn("Failed to persist sendMessagesWith preference", { error });
    }
  },
}));
