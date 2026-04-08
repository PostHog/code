import { DEFAULT_TAB_IDS } from "@features/panels/constants/panelConstants";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { findTabInTree } from "@features/panels/store/panelTree";
import { getSessionService } from "@features/sessions/service/service";
import { useCallback } from "react";
import { useReviewNavigationStore } from "../stores/reviewNavigationStore";
import type { OnCommentCallback } from "../types";

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function useReviewComment(taskId: string): OnCommentCallback {
  return useCallback(
    (filePath, startLine, endLine, side, comment) => {
      const lineRef =
        startLine === endLine
          ? `line ${startLine}`
          : `lines ${startLine}-${endLine}`;
      const sideLabel = side === "deletions" ? "old" : "new";
      const escapedPath = escapeXmlAttr(filePath);
      const prompt = `In file <file path="${escapedPath}" />, ${lineRef} (${sideLabel}):\n\n${comment}`;

      getSessionService().sendPrompt(taskId, prompt);

      const { getReviewMode, setReviewMode } =
        useReviewNavigationStore.getState();
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
    },
    [taskId],
  );
}
