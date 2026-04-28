import { create } from "zustand";

export type ScratchpadCreationStep = "idle" | "submitting";

interface ScratchpadCreationState {
  open: boolean;
  step: ScratchpadCreationStep;
  lastError: string | null;
}

interface ScratchpadCreationActions {
  openDialog: () => void;
  closeDialog: () => void;
  setStep: (step: ScratchpadCreationStep) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

type ScratchpadCreationStore = ScratchpadCreationState &
  ScratchpadCreationActions;

const INITIAL_STATE: ScratchpadCreationState = {
  open: false,
  step: "idle",
  lastError: null,
};

export const useScratchpadCreationStore = create<ScratchpadCreationStore>()(
  (set) => ({
    ...INITIAL_STATE,

    openDialog: () => set({ open: true, lastError: null, step: "idle" }),
    closeDialog: () => set({ open: false }),
    setStep: (step) => set({ step }),
    setError: (error) => set({ lastError: error }),
    reset: () => set({ ...INITIAL_STATE }),
  }),
);
