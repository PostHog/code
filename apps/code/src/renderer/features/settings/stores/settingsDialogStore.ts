import { create } from "zustand";

export type SettingsCategory =
  | "general"
  | "account"
  | "workspaces"
  | "worktrees"
  | "environments"
  | "personalization"
  | "claude-code"
  | "shortcuts"
  | "mcp-servers"
  | "signals"
  | "updates"
  | "advanced";

interface SettingsDialogContext {
  repoPath?: string;
}

interface SettingsDialogState {
  isOpen: boolean;
  activeCategory: SettingsCategory;
  context: SettingsDialogContext;
}

interface SettingsDialogActions {
  open: (category?: SettingsCategory, context?: SettingsDialogContext) => void;
  close: () => void;
  setCategory: (category: SettingsCategory) => void;
  clearContext: () => void;
}

type SettingsDialogStore = SettingsDialogState & SettingsDialogActions;

export const useSettingsDialogStore = create<SettingsDialogStore>()(
  (set, get) => ({
    isOpen: false,
    activeCategory: "general",
    context: {},

    open: (category, context) => {
      if (!get().isOpen) {
        window.history.pushState({ settingsOpen: true }, "");
      }
      set({
        isOpen: true,
        activeCategory: category ?? "general",
        context: context ?? {},
      });
    },
    close: () => {
      if (get().isOpen && window.history.state?.settingsOpen) {
        window.history.back();
      }
      set({ isOpen: false, context: {} });
    },
    setCategory: (category) => set({ activeCategory: category }),
    clearContext: () => set({ context: {} }),
  }),
);
