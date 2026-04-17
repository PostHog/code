import { useSessionForTask } from "@features/sessions/hooks/useSession";
import {
  buildCloudEventSummary,
  type CloudEventSummary,
} from "@features/task-detail/utils/cloudToolChanges";
import { useMemo } from "react";

const EMPTY_SUMMARY: CloudEventSummary = {
  toolCalls: new Map(),
  treeSnapshotFiles: [],
};

export function useCloudEventSummary(
  taskId: string,
  enabled = true,
): CloudEventSummary {
  const session = useSessionForTask(enabled ? taskId : undefined);
  const events = session?.events;
  return useMemo(
    () => (events ? buildCloudEventSummary(events) : EMPTY_SUMMARY),
    [events],
  );
}
