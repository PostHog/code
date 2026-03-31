import { ActionTerminal } from "@features/terminal/components/ActionTerminal";
import { Box } from "@radix-ui/themes";

interface ActionPanelProps {
  taskId: string;
  actionId: string;
  command: string;
  cwd: string;
}

export function ActionPanel({
  taskId,
  actionId,
  command,
  cwd,
}: ActionPanelProps) {
  return (
    <Box height="100%">
      <ActionTerminal
        actionId={actionId}
        command={command}
        cwd={cwd}
        taskId={taskId}
      />
    </Box>
  );
}
