import {
  ArrowSquareOut,
  Cloud,
  GitBranch,
  XCircle,
} from "@phosphor-icons/react";
import type { TaskRunStatus } from "@posthog/ui";
import { DotsCircleSpinner } from "@posthog/ui";
import { Button, Flex, Text } from "@radix-ui/themes";

interface StatusBarProps {
  status?: TaskRunStatus;
  stage?: string | null;
  errorMessage?: string | null;
  branch?: string | null;
  prUrl?: string | null;
  onCancel: () => void;
}

export function StatusBar({
  status,
  stage,
  errorMessage,
  branch,
  prUrl,
  onCancel,
}: StatusBarProps) {
  const isRunning = status === "started" || status === "in_progress";

  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      className="border-gray-4 border-t px-4 py-2"
      style={{ backgroundColor: "var(--gray-2)" }}
    >
      <Flex align="center" gap="2" className="min-w-0 flex-1">
        {isRunning ? (
          <>
            <DotsCircleSpinner size={14} className="text-accent-11" />
            <Text size="2" color="gray" className="truncate">
              Running{stage ? ` — ${stage}` : ""}...
            </Text>
          </>
        ) : status === "completed" ? (
          <>
            <Cloud size={14} weight="fill" className="text-green-11" />
            <Text size="2" className="text-green-11">
              Completed
            </Text>
          </>
        ) : status === "failed" ? (
          <>
            <XCircle size={14} weight="fill" className="text-red-11" />
            <Text size="2" color="red" className="truncate">
              Failed{errorMessage ? `: ${errorMessage}` : ""}
            </Text>
          </>
        ) : status === "cancelled" ? (
          <>
            <XCircle size={14} weight="fill" className="text-gray-10" />
            <Text size="2" color="gray">
              Cancelled
            </Text>
          </>
        ) : null}

        {branch && (
          <Flex align="center" gap="1" className="text-gray-10">
            <GitBranch size={12} />
            <Text size="1" className="font-mono">
              {branch}
            </Text>
          </Flex>
        )}
      </Flex>

      <Flex align="center" gap="2">
        {isRunning && (
          <Button size="1" variant="soft" color="red" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {prUrl && (
          <Button size="1" variant="soft" asChild>
            <a href={prUrl} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut size={14} />
              View PR
            </a>
          </Button>
        )}
      </Flex>
    </Flex>
  );
}
