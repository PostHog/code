import { Text, Tooltip } from "@radix-ui/themes";
import { useContextUsageForTask } from "@renderer/features/sessions/hooks/useSession";

const CONTEXT_WARNING_THRESHOLD_PCT = 40;

interface ContextUsageIndicatorProps {
  taskId?: string;
}

export function ContextUsageIndicator({ taskId }: ContextUsageIndicatorProps) {
  const contextUsage = useContextUsageForTask(taskId);
  if (!contextUsage || contextUsage.size <= 0) return null;

  const percent = Math.round((contextUsage.used / contextUsage.size) * 100);

  if (percent < CONTEXT_WARNING_THRESHOLD_PCT) return null;

  return (
    <Tooltip
      content={`Context: ${percent}% used (${Math.round(contextUsage.used / 1000)}k / ${Math.round(contextUsage.size / 1000)}k tokens)`}
    >
      <Text
        size="1"
        style={{
          color: getContextColor(percent),
          fontFamily: "var(--font-mono)",
          padding: "4px 10px",
          cursor: "default",
        }}
      >
        {percent}%
      </Text>
    </Tooltip>
  );
}

function getContextColor(percent: number): string {
  if (percent >= 80) return "var(--red-9)";
  if (percent >= 50) return "var(--yellow-11)";
  return "var(--green-9)";
}
