import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import { sendPromptToAgent } from "@features/sessions/utils/sendPromptToAgent";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback } from "react";
import type { FixWithAgentPrompt } from "../utils/errorPrompts";

/**
 * Hook that sends a structured error prompt to the active agent session.
 * Derives taskId and session readiness from stores.
 *
 * `canFixWithAgent` is true when there's an active, connected session.
 */
export function useFixWithAgent(
  buildPrompt: (error: string) => FixWithAgentPrompt,
): {
  canFixWithAgent: boolean;
  fixWithAgent: (error: string) => Promise<void>;
} {
  const taskId = useNavigationStore((s) =>
    s.view.type === "task-detail" ? s.view.data?.id : undefined,
  );
  const session = useSessionForTask(taskId);
  const isSessionReady = session?.status === "connected";

  const canFixWithAgent = !!(taskId && isSessionReady);

  const fixWithAgent = useCallback(
    async (error: string) => {
      if (!taskId || !isSessionReady) return;

      const { label, context } = buildPrompt(error);

      const prompt = `<error_context label="${label}">${context}</error_context>\n\n\`\`\`\n${error}\n\`\`\``;
      sendPromptToAgent(taskId, prompt);
    },
    [buildPrompt, taskId, isSessionReady],
  );

  return { canFixWithAgent, fixWithAgent };
}
