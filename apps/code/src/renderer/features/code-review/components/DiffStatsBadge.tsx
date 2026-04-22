import { Tooltip } from "@components/ui/Tooltip";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useIsWorkspaceCloudRun } from "@features/workspace/hooks/useWorkspace";
import { GitDiff } from "@phosphor-icons/react";
import { Button } from "@posthog/quill";
import { Flex, Text } from "@radix-ui/themes";
import {
  formatHotkey,
  SHORTCUTS,
} from "@renderer/constants/keyboard-shortcuts";
import { useSandboxDiffStats } from "@renderer/features/code-review/hooks/useSandboxGit";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import type { Task } from "@shared/types";

interface DiffStatsBadgeProps {
  task: Task;
}

export function DiffStatsBadge({ task }: DiffStatsBadgeProps) {
  const isCloud = useIsWorkspaceCloudRun(task.id);
  if (isCloud) {
    return <CloudDiffStatsBadge task={task} />;
  }
  return <LocalDiffStatsBadge task={task} />;
}

function LocalDiffStatsBadge({ task }: DiffStatsBadgeProps) {
  const repoPath = useCwd(task.id);
  const { diffStats } = useGitQueries(repoPath);
  return (
    <DiffStatsBadgeView
      task={task}
      filesChanged={diffStats.filesChanged}
      linesAdded={diffStats.linesAdded}
      linesRemoved={diffStats.linesRemoved}
    />
  );
}

function CloudDiffStatsBadge({ task }: DiffStatsBadgeProps) {
  const { data: stats } = useSandboxDiffStats(task.id, {
    refetchInterval: 10_000,
  });
  return (
    <DiffStatsBadgeView
      task={task}
      filesChanged={stats?.filesChanged ?? 0}
      linesAdded={stats?.linesAdded ?? 0}
      linesRemoved={stats?.linesRemoved ?? 0}
    />
  );
}

function DiffStatsBadgeView({
  task,
  filesChanged,
  linesAdded,
  linesRemoved,
}: DiffStatsBadgeProps & {
  filesChanged: number;
  linesAdded: number;
  linesRemoved: number;
}) {
  const taskId = task.id;
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
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className={`no-drag font-mono text-(--gray-11) text-[11px] transition-colors duration-100 hover:bg-(--gray-a3) ${isOpen ? "bg-(--gray-a3)" : "bg-transparent"}`}
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
      </Button>
    </Tooltip>
  );
}
