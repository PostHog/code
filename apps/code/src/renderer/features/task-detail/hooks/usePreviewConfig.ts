import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import {
  getSessionService,
  PREVIEW_CONFIG_ID,
} from "@features/sessions/service/service";
import {
  useModeConfigOptionForTask,
  useModelConfigOptionForTask,
  useSessionForTask,
  useThoughtLevelConfigOptionForTask,
} from "@features/sessions/stores/sessionStore";
import { useEffect } from "react";

interface PreviewConfigResult {
  modeOption: SessionConfigOption | undefined;
  modelOption: SessionConfigOption | undefined;
  thoughtOption: SessionConfigOption | undefined;
  previewConfigId: string;
  /** True while the preview config is loading (no config options yet) */
  isConnecting: boolean;
}

/**
 * Fetches adapter-specific config options (models, modes, reasoning levels)
 * for the task input page without spawning a full agent session.
 *
 * Refetches when the adapter changes and cleans up on unmount.
 */
export function usePreviewConfig(
  adapter: "claude" | "codex",
): PreviewConfigResult {
  const projectId = useAuthStateValue((state) => state.projectId);

  useEffect(() => {
    if (!projectId) return;

    const service = getSessionService();
    service.fetchPreviewConfig({ adapter });

    return () => {
      service.cancelPreviewConfig();
    };
  }, [adapter, projectId]);

  const session = useSessionForTask(PREVIEW_CONFIG_ID);
  const modeOption = useModeConfigOptionForTask(PREVIEW_CONFIG_ID);
  const modelOption = useModelConfigOptionForTask(PREVIEW_CONFIG_ID);
  const thoughtOption = useThoughtLevelConfigOptionForTask(PREVIEW_CONFIG_ID);

  // Connecting if we have a session but it's not connected yet,
  // or if we don't have a session at all (start hasn't created one yet)
  const isConnecting = !session || session.status === "connecting";

  return {
    modeOption,
    modelOption,
    thoughtOption,
    previewConfigId: PREVIEW_CONFIG_ID,
    isConnecting,
  };
}
