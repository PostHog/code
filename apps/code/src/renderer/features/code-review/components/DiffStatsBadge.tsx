import { Tooltip } from "@components/ui/Tooltip";
import {
  useLocalBranchChangedFiles,
  usePrChangedFiles,
} from "@features/git-interaction/hooks/useGitQueries";
import {
  computeDiffStats,
  type DiffStats,
} from "@features/git-interaction/utils/diffStats";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useCloudChangedFiles } from "@features/task-detail/hooks/useCloudChangedFiles";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { GitDiff } from "@phosphor-icons/react";
import { Button } from "@posthog/quill";
import { Flex, Text } from "@radix-ui/themes";
import {
  formatHotkey,
  SHORTCUTS,
} from "@renderer/constants/keyboard-shortcuts";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import type { Task } from "@shared/types";
import { useMemo } from "react";
import { useEffectiveDiffSource } from "../hooks/useEffectiveDiffSource";

interface DiffStatsBadgeProps {
  task: Task;
}

export function DiffStatsBadge({ task }: DiffStatsBadgeProps) {
  const workspace = useWorkspace(task.id);
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";
  return isCloud ? (
    <CloudDiffStatsBadge task={task} />
  ) : (
    <LocalDiffStatsBadge task={task} />
  );
}

function CloudDiffStatsBadge({ task }: { task: Task }) {
  const { reviewFiles } = useCloudChangedFiles(task.id, task);
  const stats = useMemo(() => computeDiffStats(reviewFiles), [reviewFiles]);
  return <DiffStatsButton taskId={task.id} stats={stats} />;
}

function LocalDiffStatsBadge({ task }: { task: Task }) {
  const taskId = task.id;
  const repoPath = useCwd(taskId);
  const {
    effectiveSource,
    linkedBranch,
    prUrl,
    diffStats: localDiffStats,
  } = useEffectiveDiffSource(taskId);

  const { data: branchFiles } = useLocalBranchChangedFiles(
    effectiveSource === "branch" ? (repoPath ?? null) : null,
    effectiveSource === "branch" ? linkedBranch : null,
  );
  const { data: prFiles } = usePrChangedFiles(
    effectiveSource === "pr" ? prUrl : null,
  );

  const stats = useMemo<DiffStats>(() => {
    if (effectiveSource === "branch" && branchFiles) {
      return computeDiffStats(branchFiles);
    }
    if (effectiveSource === "pr" && prFiles) {
      return computeDiffStats(prFiles);
    }
    return localDiffStats;
  }, [effectiveSource, branchFiles, prFiles, localDiffStats]);

  return <DiffStatsButton taskId={taskId} stats={stats} />;
}

function DiffStatsButton({
  taskId,
  stats,
}: {
  taskId: string;
  stats: DiffStats;
}) {
  const reviewMode = useReviewNavigationStore(
    (s) => s.reviewModes[taskId] ?? "closed",
  );
  const setReviewMode = useReviewNavigationStore((s) => s.setReviewMode);

  const { filesChanged, linesAdded, linesRemoved } = stats;
  const hasChanges = filesChanged > 0;
  const isOpen = reviewMode !== "closed";

  const handleClick = () => {
    setReviewMode(taskId, isOpen ? "closed" : "split");
  };

  return (
    <Tooltip
      content={isOpen ? "Close review panel" : "Open review panel"}
      shortcut={formatHotkey(SHORTCUTS.TOGGLE_REVIEW_PANEL)}
      side="bottom"
    >
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className={`no-drag font-mono text-(--gray-11) text-[11px] transition-colors duration-100 hover:bg-(--gray-a3) ${isOpen ? "bg-(--gray-a3)" : "bg-transparent"}`}
      >
        <GitDiff size={14} className="shrink-0" />
        {hasChanges ? (
          <Flex align="center" gap="1">
            {linesAdded > 0 && (
              <Text className="text-(--green-9) text-[11px]">
                +{linesAdded}
              </Text>
            )}
            {linesRemoved > 0 && (
              <Text className="text-(--red-9) text-[11px]">
                -{linesRemoved}
              </Text>
            )}
          </Flex>
        ) : (
          <Text className="text-(--gray-9) text-[11px]">0</Text>
        )}
      </Button>
    </Tooltip>
  );
}
