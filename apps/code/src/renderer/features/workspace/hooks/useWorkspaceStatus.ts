import { trpcReact } from "@renderer/trpc";
import { useCallback, useEffect, useState } from "react";
import { useWorkspaceTerminalStore } from "../stores/workspaceTerminalStore";
import { useCreateWorkspace, useWorkspace } from "./useWorkspace";

interface WorkspaceStatus {
  hasWorkspace: boolean;
  isRunning: boolean;
  isCreating: boolean;
  isCheckingStatus: boolean;
}

export function useWorkspaceStatus(taskId: string): WorkspaceStatus {
  const workspace = useWorkspace(taskId);
  const { isPending: isCreating } = useCreateWorkspace();
  const terminalsRunning = useWorkspaceTerminalStore((s) =>
    s.areTerminalsRunning(taskId),
  );

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isRunning, setIsRunning] = useState(terminalsRunning);

  const utils = trpcReact.useUtils();

  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const isRunning = await utils.workspace.isRunning.fetch({ taskId });
      setIsRunning(isRunning);
    } catch {
      setIsRunning(false);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [taskId, utils.workspace.isRunning]);

  useEffect(() => {
    if (workspace) {
      checkStatus();
    }
  }, [workspace, checkStatus]);

  return {
    hasWorkspace: !!workspace,
    isRunning: isRunning || terminalsRunning,
    isCreating,
    isCheckingStatus,
  };
}
