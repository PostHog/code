import type { SignalSourceValues } from "@features/inbox/components/SignalSourceToggles";
import { create } from "zustand";

interface SignalSourceSelectionsStore {
  /** null means no user override — consumers derive from server state */
  userSelections: SignalSourceValues | null;
  setUserSelections: (v: SignalSourceValues) => void;
}

export const useSignalSourceSelectionsStore =
  create<SignalSourceSelectionsStore>()((set) => ({
    userSelections: null,
    setUserSelections: (userSelections) => set({ userSelections }),
  }));
