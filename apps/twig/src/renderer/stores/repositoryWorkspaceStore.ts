import { create } from "zustand";

interface RepositoryWorkspaceState {
  selectedRepository: string | null;
  selectRepository: (repo: string | null) => void;
}

export const repositoryWorkspaceStore = create<RepositoryWorkspaceState>()(
  (set) => ({
    selectedRepository: null,
    selectRepository: (repo) => set({ selectedRepository: repo }),
  }),
);
