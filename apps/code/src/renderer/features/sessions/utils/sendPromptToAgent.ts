import { useReviewNavigationStore } from "@features/code-review/stores/reviewNavigationStore";
import { DEFAULT_TAB_IDS } from "@features/panels/constants/panelConstants";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { findTabInTree } from "@features/panels/store/panelTree";
import { getSessionService } from "@features/sessions/service/service";

/**
 * Sends a prompt to the agent session for a task, collapses the review
 * panel to split mode if expanded, and switches to the logs/chat tab.
 */
export function sendPromptToAgent(taskId: string, prompt: string): void {
  getSessionService().sendPrompt(taskId, prompt);

  const { getReviewMode, setReviewMode } = useReviewNavigationStore.getState();
  if (getReviewMode(taskId) === "expanded") {
    setReviewMode(taskId, "split");
  }

  const { taskLayouts, setActiveTab } = usePanelLayoutStore.getState();
  const layout = taskLayouts[taskId];
  if (layout) {
    const result = findTabInTree(layout.panelTree, DEFAULT_TAB_IDS.LOGS);
    if (result) {
      setActiveTab(taskId, result.panelId, DEFAULT_TAB_IDS.LOGS);
    }
  }
}
