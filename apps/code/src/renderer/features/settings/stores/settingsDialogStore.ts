import { create } from "zustand";

export type SettingsCategory =
  | "general"
  | "account"
  | "workspaces"
  | "worktrees"
  | "cloud-environments"
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
  initialAction: string | null;
}

interface SettingsDialogActions {
  open: (category?: SettingsCategory, context?: SettingsDialogContext) => void;
  close: () => void;
  setCategory: (category: SettingsCategory) => void;
  clearContext: () => void;
  consumeInitialAction: () => string | null;
}

type SettingsDialogStore = SettingsDialogState & SettingsDialogActions;

export const useSettingsDialogStore = create<SettingsDialogStore>()(
  (set, get) => ({
    isOpen: false,
    activeCategory: "general",
    context: {},
    initialAction: null,

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
      set({ isOpen: false, context: {}, initialAction: null });
    },
    setCategory: (category) => set({ activeCategory: category, initialAction: null }),
    clearContext: () => set({ context: {} }),
    consumeInitialAction: () => {
      const action = get().initialAction;
      if (action) set({ initialAction: null });
      return action;
    },
  }),
);
