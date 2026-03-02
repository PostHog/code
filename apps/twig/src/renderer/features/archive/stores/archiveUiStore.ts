import { create } from "zustand";

interface ArchiveUiState {
  archivingTaskId: string | null;
  unarchivingTaskId: string | null;
}

interface ArchiveUiActions {
  setArchivingTaskId: (taskId: string | null) => void;
  setUnarchivingTaskId: (taskId: string | null) => void;
}

type ArchiveUiStore = ArchiveUiState & ArchiveUiActions;

export const useArchiveUiStore = create<ArchiveUiStore>()((set) => ({
  archivingTaskId: null,
  unarchivingTaskId: null,
  setArchivingTaskId: (taskId) => set({ archivingTaskId: taskId }),
  setUnarchivingTaskId: (taskId) => set({ unarchivingTaskId: taskId }),
}));

export const selectIsArchiving = (taskId: string) => (state: ArchiveUiState) =>
  state.archivingTaskId === taskId;

export const selectIsUnarchiving =
  (taskId: string) => (state: ArchiveUiState) =>
    state.unarchivingTaskId === taskId;
