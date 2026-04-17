import { useCloudEventSummary } from "@features/task-detail/hooks/useCloudEventSummary";
import {
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
  const summary = useCloudEventSummary(taskId, enabled);
  const isLoading = enabled && summary.toolCalls.size === 0;

  return useMemo(() => {
    if (!enabled) {
      return { content: null, touched: false, isLoading: false };
    }
    const result = extractCloudFileContent(summary.toolCalls, filePath);
    return { ...result, isLoading };
  }, [enabled, summary, filePath, isLoading]);
}
