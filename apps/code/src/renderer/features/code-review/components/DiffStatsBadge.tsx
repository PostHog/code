import { Tooltip } from "@components/ui/Tooltip";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { computeDiffStats } from "@features/git-interaction/utils/diffStats";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useCloudChangedFiles } from "@features/task-detail/hooks/useCloudChangedFiles";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { GitDiff } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import {
  formatHotkey,
  SHORTCUTS,
} from "@renderer/constants/keyboard-shortcuts";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import type { Task } from "@shared/types";
import { useMemo } from "react";

interface DiffStatsBadgeProps {
  task: Task;
}

function useChangedFileStats(task: Task) {
  const taskId = task.id;
  const workspace = useWorkspace(taskId);
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";
  const repoPath = useCwd(taskId);

  const { diffStats: localDiffStats } = useGitQueries(
    isCloud ? undefined : repoPath,
  );

  const { changedFiles: cloudFiles } = useCloudChangedFiles(taskId, task);

  return useMemo(() => {
    if (isCloud) {
      const stats = computeDiffStats(cloudFiles);
      return {
        filesChanged: stats.filesChanged,
        linesAdded: stats.linesAdded,
        linesRemoved: stats.linesRemoved,
      };
    }
    return {
      filesChanged: localDiffStats.filesChanged,
      linesAdded: localDiffStats.linesAdded,
      linesRemoved: localDiffStats.linesRemoved,
    };
  }, [isCloud, cloudFiles, localDiffStats]);
}

export function DiffStatsBadge({ task }: DiffStatsBadgeProps) {
  const taskId = task.id;
  const { filesChanged, linesAdded, linesRemoved } = useChangedFileStats(task);
  const reviewMode = useReviewNavigationStore(
    (s) => s.reviewModes[taskId] ?? "closed",
  );
  const setReviewMode = useReviewNavigationStore((s) => s.setReviewMode);

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
      <button
        type="button"
        onClick={handleClick}
        className={`no-drag inline-flex h-6 cursor-pointer items-center gap-1 rounded-[var(--radius-1)] border-none px-1.5 font-mono text-[11px] text-[var(--gray-11)] transition-colors duration-100 hover:bg-[var(--gray-a3)] ${isOpen ? "bg-[var(--gray-a3)]" : "bg-transparent"}`}
      >
        <GitDiff size={14} style={{ flexShrink: 0 }} />
        {hasChanges ? (
          <Flex align="center" gap="1">
            {linesAdded > 0 && (
              <Text style={{ color: "var(--green-9)", fontSize: "11px" }}>
                +{linesAdded}
              </Text>
            )}
            {linesRemoved > 0 && (
              <Text style={{ color: "var(--red-9)", fontSize: "11px" }}>
                -{linesRemoved}
              </Text>
            )}
          </Flex>
        ) : (
          <Text style={{ color: "var(--gray-9)", fontSize: "11px" }}>0</Text>
        )}
      </button>
    </Tooltip>
  );
}
