import { create } from "zustand";

export type SettingsCategory =
  | "general"
  | "plan-usage"
  | "workspaces"
  | "worktrees"
  | "environments"
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
  open: (
    category?: SettingsCategory,
    contextOrAction?: SettingsDialogContext | string,
  ) => void;
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

    open: (category, contextOrAction) => {
      if (!get().isOpen) {
        window.history.pushState({ settingsOpen: true }, "");
      }
      const isAction = typeof contextOrAction === "string";
      set({
        isOpen: true,
        activeCategory: category ?? "general",
        context: isAction ? {} : (contextOrAction ?? {}),
        initialAction: isAction ? contextOrAction : null,
      });
    },
    close: () => {
      if (get().isOpen && window.history.state?.settingsOpen) {
        window.history.back();
      }
      set({ isOpen: false, context: {}, initialAction: null });
    },
    setCategory: (category) =>
      set({ activeCategory: category, initialAction: null }),
    clearContext: () => set({ context: {} }),
    consumeInitialAction: () => {
      const action = get().initialAction;
      if (action) set({ initialAction: null });
      return action;
    },
  }),
);
