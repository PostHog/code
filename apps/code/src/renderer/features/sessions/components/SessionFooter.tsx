import type { ContextUsage } from "@features/sessions/hooks/useContextUsage";
import { Brain, Pause } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";

import { ContextUsageIndicator } from "./ContextUsageIndicator";
import { formatDuration, GeneratingIndicator } from "./GeneratingIndicator";

interface SessionFooterProps {
  isPromptPending: boolean | null;
  promptStartedAt?: number | null;
  lastGenerationDuration: number | null;
  lastStopReason?: string;
  queuedCount?: number;
  hasPendingPermission?: boolean;
  pausedDurationMs?: number;
  isCompacting?: boolean;
  usage?: ContextUsage | null;
}

export function SessionFooter({
  isPromptPending,
  promptStartedAt,
  lastGenerationDuration,
  lastStopReason,
  queuedCount = 0,
  hasPendingPermission = false,
  pausedDurationMs,
  isCompacting = false,
  usage,
}: SessionFooterProps) {
  if (isPromptPending && !isCompacting) {
    if (hasPendingPermission) {
      return (
        <Box className="pt-3 pb-1">
          <Flex align="center" justify="between" gap="2">
            <Flex
              align="center"
              gap="2"
              className="select-none text-gray-10"
              style={{ userSelect: "none", WebkitUserSelect: "none" }}
            >
              <Pause size={14} weight="fill" />
              <Text size="1">Awaiting permission...</Text>
            </Flex>
            <ContextUsageIndicator usage={usage ?? null} />
          </Flex>
        </Box>
      );
    }

    return (
      <Box className="pt-3 pb-1">
        <Flex align="center" justify="between" gap="2">
          <Flex align="center" gap="2">
            <GeneratingIndicator
              startedAt={promptStartedAt}
              pausedDurationMs={pausedDurationMs}
            />
            {queuedCount > 0 && (
              <Text size="1" color="gray">
                ({queuedCount} queued)
              </Text>
            )}
          </Flex>
          <ContextUsageIndicator usage={usage ?? null} />
        </Flex>
      </Box>
    );
  }

  const wasCancelled =
    lastStopReason === "cancelled" || lastStopReason === "refusal";

  const showDuration =
    lastGenerationDuration !== null &&
    lastGenerationDuration > 0 &&
    !wasCancelled;

  return (
    <Box className="pb-1">
      <Flex align="center" justify="between" gap="2">
        {showDuration && (
          <Flex align="center" gap="2" className="select-none text-gray-10">
            <Brain size={12} />
            <Text
              size="1"
              color="gray"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              Generated in {formatDuration(lastGenerationDuration)}
            </Text>
          </Flex>
        )}
        <ContextUsageIndicator usage={usage ?? null} />
      </Flex>
    </Box>
  );
}
