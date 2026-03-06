import { PanelMessage } from "@components/ui/PanelMessage";
import { CodeMirrorDiffEditor } from "@features/code-editor/components/CodeMirrorDiffEditor";
import { useSessionForTask } from "@features/sessions/hooks/useSession";
import {
  buildCloudEventSummary,
  extractCloudFileDiff,
} from "@features/task-detail/utils/cloudToolChanges";
import { Box } from "@radix-ui/themes";
import type { AcpMessage } from "@shared/types/session-events";
import { useMemo } from "react";

const EMPTY_EVENTS: AcpMessage[] = [];

interface CloudDiffEditorPanelProps {
  taskId: string;
  relativePath: string;
}

export function CloudDiffEditorPanel({
  taskId,
  relativePath,
}: CloudDiffEditorPanelProps) {
  const session = useSessionForTask(taskId);
  const events = session?.events ?? EMPTY_EVENTS;

  const { toolCalls } = useMemo(() => buildCloudEventSummary(events), [events]);
  const diff = useMemo(
    () => extractCloudFileDiff(toolCalls, relativePath),
    [toolCalls, relativePath],
  );

  if (!diff) {
    return (
      <PanelMessage>
        File was modified outside of tracked tool calls
      </PanelMessage>
    );
  }

  const { oldText, newText } = diff;

  // File was created then deleted — nothing to show
  if (oldText === null && newText === null) {
    return <PanelMessage>No diff data available for this file</PanelMessage>;
  }

  // Always show the diff editor — treat null as empty string so additions
  // appear green and deletions red (Write tools don't capture oldText, so
  // null oldText just means "show everything as added").
  return (
    <Box height="100%" style={{ overflow: "hidden" }}>
      <CodeMirrorDiffEditor
        originalContent={oldText ?? ""}
        modifiedContent={newText ?? ""}
        relativePath={relativePath}
      />
    </Box>
  );
}
