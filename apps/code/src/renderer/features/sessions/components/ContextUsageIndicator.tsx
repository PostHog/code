import { Tooltip } from "@components/ui/Tooltip";
import type { ContextUsage } from "@features/sessions/hooks/useContextUsage";
import { Flex, Text } from "@radix-ui/themes";

function formatTokensCompact(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  return `${Math.round(tokens / 1000)}K`;
}

function formatTokensFull(tokens: number): string {
  return tokens.toLocaleString();
}

function getUsageColor(percentage: number): string {
  if (percentage >= 90) return "var(--red-9)";
  if (percentage >= 75) return "var(--orange-9)";
  if (percentage >= 50) return "var(--amber-9)";
  return "var(--green-9)";
}

const CIRCLE_SIZE = 20;
const STROKE_WIDTH = 2.5;
const RADIUS = (CIRCLE_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface ContextUsageIndicatorProps {
  usage: ContextUsage | null;
}

export function ContextUsageIndicator({ usage }: ContextUsageIndicatorProps) {
  if (!usage) return null;

  const { used, size, percentage } = usage;
  const strokeDashoffset = CIRCUMFERENCE - (percentage / 100) * CIRCUMFERENCE;
  const color = getUsageColor(percentage);

  return (
    <Tooltip
      content={`${formatTokensFull(used)} / ${formatTokensFull(size)} tokens (${percentage}%)`}
      side="top"
    >
      <Flex align="center" gap="1" className="cursor-default select-none">
        <svg
          width={CIRCLE_SIZE}
          height={CIRCLE_SIZE}
          className="-rotate-90 shrink-0"
          role="img"
          aria-label={`Context usage: ${percentage}%`}
        >
          <circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--gray-5)"
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={color}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <Text className="text-[13px] text-gray-10 tabular-nums">
          {formatTokensCompact(used)}/{formatTokensCompact(size)}
        </Text>
      </Flex>
    </Tooltip>
  );
}
