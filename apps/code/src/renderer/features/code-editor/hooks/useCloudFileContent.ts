import { useSessionForTask } from "@features/sessions/hooks/useSession";
import {
  buildCloudEventSummary,
  type CloudFileContent,
  extractCloudFileContent,
} from "@features/task-detail/utils/cloudToolChanges";
import { useMemo } from "react";

export type CloudFileResult = CloudFileContent & { isLoading: boolean };

export function useCloudFileContent(
  taskId: string,
  filePath: string,
  enabled: boolean,
): CloudFileResult {
  const session = useSessionForTask(enabled ? taskId : undefined);
  const events = session?.events;
  const isLoading = enabled && session === undefined;

  return useMemo(() => {
    if (!enabled || !events) {
      return { content: null, touched: false, isLoading };
    }
    const summary = buildCloudEventSummary(events);
    const result = extractCloudFileContent(summary.toolCalls, filePath);
    return { ...result, isLoading: false };
  }, [enabled, events, filePath, isLoading]);
}
