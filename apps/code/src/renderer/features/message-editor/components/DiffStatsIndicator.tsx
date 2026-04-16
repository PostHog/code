import type { DiffStats } from "@features/git-interaction/utils/diffStats";
import { Text } from "@radix-ui/themes";
import { useReviewNavigationStore } from "@renderer/features/code-review/stores/reviewNavigationStore";
import { useTRPC } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";

interface DiffStatsIndicatorProps {
  repoPath: string | null | undefined;
  overrideStats?: DiffStats | null;
  taskId?: string;
}

export function DiffStatsIndicator({
  repoPath,
  overrideStats,
  taskId,
}: DiffStatsIndicatorProps) {
  const trpc = useTRPC();
  const { data: localStats } = useQuery(
    trpc.git.getDiffStats.queryOptions(
      { directoryPath: repoPath as string },
      {
        enabled: !!repoPath && !overrideStats,
        staleTime: 5000,
        refetchInterval: 5000,
        placeholderData: (prev) => prev,
      },
    ),
  );

  const diffStats = overrideStats ?? localStats;
  const reviewMode = useReviewNavigationStore((s) =>
    taskId ? (s.reviewModes[taskId] ?? "closed") : "closed",
  );
  const setReviewMode = useReviewNavigationStore((s) => s.setReviewMode);

  if (!diffStats || diffStats.filesChanged === 0) {
    return null;
  }

  const handleClick = () => {
    if (taskId) {
      setReviewMode(taskId, reviewMode !== "closed" ? "closed" : "split");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex cursor-pointer items-center gap-2 border-none bg-transparent px-1.5 py-0.5"
      style={{ whiteSpace: "nowrap" }}
    >
      <Text
        size="1"
        style={{
          color: "var(--gray-11)",
          fontFamily: "monospace",
        }}
      >
        {diffStats.filesChanged}{" "}
        {diffStats.filesChanged === 1 ? "file" : "files"}
      </Text>
      <Text
        size="1"
        style={{
          color: "var(--green-9)",
          fontFamily: "monospace",
        }}
      >
        +{diffStats.linesAdded}
      </Text>
      <Text
        size="1"
        style={{
          color: "var(--red-9)",
          fontFamily: "monospace",
        }}
      >
        -{diffStats.linesRemoved}
      </Text>
    </button>
  );
}
