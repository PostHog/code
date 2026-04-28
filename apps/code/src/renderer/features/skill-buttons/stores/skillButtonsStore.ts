import {
  SKILL_BUTTON_ORDER,
  SKILL_BUTTONS,
} from "@features/skill-buttons/prompts";
import type { SkillButtonId } from "@shared/types/analytics";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SkillButtonsStoreState {
  lastSelectedId: SkillButtonId;
}

interface SkillButtonsStoreActions {
  setLastSelectedId: (id: SkillButtonId) => void;
}

type SkillButtonsStore = SkillButtonsStoreState & SkillButtonsStoreActions;

const DEFAULT_PRIMARY: SkillButtonId = SKILL_BUTTON_ORDER[0];

export const useSkillButtonsStore = create<SkillButtonsStore>()(
  persist(
    (set) => ({
      lastSelectedId: DEFAULT_PRIMARY,
      setLastSelectedId: (lastSelectedId) => set({ lastSelectedId }),
    }),
    {
      name: "skill-buttons-storage",
      merge: (persisted, current) => {
        const persistedState = persisted as {
          lastSelectedId?: string;
        };
        const restored =
          persistedState.lastSelectedId &&
          persistedState.lastSelectedId in SKILL_BUTTONS
            ? (persistedState.lastSelectedId as SkillButtonId)
            : DEFAULT_PRIMARY;
        return {
          ...current,
          lastSelectedId: restored,
        };
      },
    },
  ),
);
