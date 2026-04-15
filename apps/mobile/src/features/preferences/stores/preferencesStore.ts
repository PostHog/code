import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PreferencesState {
  aiChatEnabled: boolean;
  setAiChatEnabled: (enabled: boolean) => void;
  pingsEnabled: boolean;
  setPingsEnabled: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      aiChatEnabled: false,
      setAiChatEnabled: (enabled) => set({ aiChatEnabled: enabled }),
      pingsEnabled: true,
      setPingsEnabled: (enabled) => set({ pingsEnabled: enabled }),
    }),
    {
      name: "posthog-preferences",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        aiChatEnabled: state.aiChatEnabled,
        pingsEnabled: state.pingsEnabled,
      }),
    },
  ),
);
