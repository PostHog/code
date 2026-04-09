import { Tooltip } from "@components/ui/Tooltip";
import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import {
  ArrowsClockwise,
  ArrowsIn,
  ArrowsOut,
  Columns,
  CornersIn,
  CornersOut,
  Rows,
} from "@phosphor-icons/react";
import { Flex, IconButton, Separator, Text } from "@radix-ui/themes";
import { DiffSettingsMenu } from "@renderer/features/code-review/components/DiffSettingsMenu";
import {
  type ReviewMode,
  useReviewNavigationStore,
} from "@renderer/features/code-review/stores/reviewNavigationStore";
import { memo } from "react";

interface ReviewToolbarProps {
  taskId: string;
  fileCount: number;
  linesAdded: number;
  linesRemoved: number;
  allExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onRefresh?: () => void;
}

export const ReviewToolbar = memo(function ReviewToolbar({
  taskId,
  fileCount,
  linesAdded,
  linesRemoved,
  allExpanded,
  onExpandAll,
  onCollapseAll,
  onRefresh,
}: ReviewToolbarProps) {
  const viewMode = useDiffViewerStore((s) => s.viewMode);
  const toggleViewMode = useDiffViewerStore((s) => s.toggleViewMode);
  const reviewMode = useReviewNavigationStore(
    (s) => s.reviewModes[taskId] ?? "closed",
  );
  const setReviewMode = useReviewNavigationStore((s) => s.setReviewMode);

  const handleToggleExpand = () => {
    const next: ReviewMode = reviewMode === "expanded" ? "split" : "expanded";
    setReviewMode(taskId, next);
  };

  return (
    <Flex
      px="3"
      py="2"
      align="center"
      gap="3"
      style={{
        borderBottom: "1px solid var(--gray-6)",
        background: "var(--color-background)",
        position: "sticky",
        top: 0,
        zIndex: 2,
        flexShrink: 0,
      }}
    >
      <Text size="1" weight="medium">
        {fileCount} file{fileCount !== 1 ? "s" : ""} changed
      </Text>
      <Flex
        align="center"
        gap="1"
        style={{ fontSize: "11px", fontFamily: "monospace" }}
      >
        {linesAdded > 0 && (
          <Text style={{ color: "var(--green-9)" }}>+{linesAdded}</Text>
        )}
        {linesRemoved > 0 && (
          <Text style={{ color: "var(--red-9)" }}>-{linesRemoved}</Text>
        )}
      </Flex>

      <Flex align="center" gap="2" ml="auto">
        {onRefresh && (
          <Tooltip content="Refresh diff">
            <IconButton
              size="1"
              variant="ghost"
              color="gray"
              onClick={onRefresh}
              style={{ cursor: "pointer" }}
            >
              <ArrowsClockwise size={14} />
            </IconButton>
          </Tooltip>
        )}

        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={toggleViewMode}
          style={{ cursor: "pointer" }}
        >
          {viewMode === "split" ? <Rows size={14} /> : <Columns size={14} />}
        </IconButton>

        <IconButton
          size="1"
          variant="ghost"
          color="gray"
          onClick={allExpanded ? onCollapseAll : onExpandAll}
          style={{ cursor: "pointer" }}
        >
          {allExpanded ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
        </IconButton>

        <DiffSettingsMenu />

        <Separator orientation="vertical" size="1" />

        <Tooltip
          content={
            reviewMode === "expanded" ? "Collapse review" : "Expand review"
          }
        >
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={handleToggleExpand}
            style={{ cursor: "pointer" }}
          >
            {reviewMode === "expanded" ? (
              <CornersIn size={14} />
            ) : (
              <CornersOut size={14} />
            )}
          </IconButton>
        </Tooltip>
      </Flex>
    </Flex>
  );
});
