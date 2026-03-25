import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { CheckCircle, Warning, X } from "@phosphor-icons/react";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import type { AutomationRunInfo } from "@shared/types/automations";

interface AutomationRunCardProps {
  run: AutomationRunInfo;
  automationName: string;
  onDismiss: (runId: string) => void;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AutomationRunCard({
  run,
  automationName,
  onDismiss,
}: AutomationRunCardProps) {
  const isSuccess = run.status === "success";
  const displayTime = run.completedAt ?? run.startedAt;

  return (
    <Box className="rounded-lg border border-gray-5 bg-gray-1 p-4">
      <Flex direction="column" gap="3">
        {/* Header */}
        <Flex align="center" justify="between" gap="2">
          <Flex align="center" gap="2" className="min-w-0 flex-1">
            {isSuccess ? (
              <CheckCircle
                size={16}
                weight="fill"
                className="shrink-0 text-green-9"
              />
            ) : (
              <Warning
                size={16}
                weight="fill"
                className="shrink-0 text-red-9"
              />
            )}
            <Text
              size="2"
              weight="medium"
              className="truncate font-mono text-[12px]"
            >
              {automationName}
            </Text>
            <Badge
              size="1"
              variant="soft"
              color={isSuccess ? "green" : "red"}
            >
              {isSuccess ? "Success" : "Failed"}
            </Badge>
            <Text
              size="1"
              className="shrink-0 font-mono text-[11px] text-gray-10"
            >
              {timeAgo(displayTime)}
            </Text>
          </Flex>
          <button
            type="button"
            onClick={() => onDismiss(run.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </Flex>

        {/* Body — markdown rendered output or error */}
        <Box className="text-[13px] leading-relaxed text-gray-12">
          {isSuccess && run.output ? (
            <MarkdownRenderer content={run.output} />
          ) : run.error ? (
            <Text size="2" color="red">
              {run.error}
            </Text>
          ) : (
            <Text size="2" className="text-gray-10">
              No output available.
            </Text>
          )}
        </Box>
      </Flex>
    </Box>
  );
}
