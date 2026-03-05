import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import { useSessionForTask } from "@features/sessions/stores/sessionStore";
import { ShellTerminal } from "@features/terminal/components/ShellTerminal";
import { useTerminalStore } from "@features/terminal/stores/terminalStore";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { Box } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useEffect } from "react";

interface TaskShellPanelProps {
  taskId: string;
  task: Task;
  shellId?: string;
}

export function TaskShellPanel({
  taskId,
  task: _task,
  shellId,
}: TaskShellPanelProps) {
  const stateKey = shellId ? `${taskId}-${shellId}` : taskId;
  const tabId = shellId || "shell";

  const session = useSessionForTask(taskId);
  const workspace = useWorkspace(taskId);
  const workspacePath = workspace?.worktreePath ?? workspace?.folderPath;

  const processName = useTerminalStore(
    (state) => state.terminalStates[stateKey]?.processName,
  );
  const startPolling = useTerminalStore((state) => state.startPolling);
  const stopPolling = useTerminalStore((state) => state.stopPolling);
  const updateTabLabel = usePanelLayoutStore((state) => state.updateTabLabel);

  useEffect(() => {
    startPolling(stateKey);
    return () => stopPolling(stateKey);
  }, [stateKey, startPolling, stopPolling]);

  useEffect(() => {
    if (processName) {
      updateTabLabel(taskId, tabId, processName);
    }
  }, [processName, taskId, tabId, updateTabLabel]);

  if (!workspacePath || !session || session.status === "connecting") {
    return null;
  }

  return (
    <Box height="100%">
      <ShellTerminal cwd={workspacePath} stateKey={stateKey} taskId={taskId} />
    </Box>
  );
}
