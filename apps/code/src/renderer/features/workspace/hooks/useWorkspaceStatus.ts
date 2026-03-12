import { useTRPC } from "@renderer/trpc";
import { useQueryClient } from "@tanstack/react-query";
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
  const trpcReact = useTRPC();
  const workspace = useWorkspace(taskId);
  const { isPending: isCreating } = useCreateWorkspace();
  const terminalsRunning = useWorkspaceTerminalStore((s) =>
    s.areTerminalsRunning(taskId),
  );

  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [isRunning, setIsRunning] = useState(terminalsRunning);

  const queryClient = useQueryClient();

  const checkStatus = useCallback(async () => {
    setIsCheckingStatus(true);
    try {
      const isRunning = await queryClient.fetchQuery(
        trpcReact.workspace.isRunning.queryOptions({ taskId }),
      );
      setIsRunning(isRunning);
    } catch {
      setIsRunning(false);
    } finally {
      setIsCheckingStatus(false);
    }
  }, [taskId, queryClient, trpcReact]);

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
