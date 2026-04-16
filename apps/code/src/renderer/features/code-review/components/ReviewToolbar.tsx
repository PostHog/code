import { Tooltip } from "@components/ui/Tooltip";
import { useDiffViewerStore } from "@features/code-editor/stores/diffViewerStore";
import { ArrowsClockwise, Columns, Rows, X } from "@phosphor-icons/react";
import { Button } from "@posthog/quill";
import { Flex, Separator, Text } from "@radix-ui/themes";
import { DiffSettingsMenu } from "@renderer/features/code-review/components/DiffSettingsMenu";
import {
  type ReviewMode,
  useReviewNavigationStore,
} from "@renderer/features/code-review/stores/reviewNavigationStore";
import { FoldVertical, Maximize, Minimize, UnfoldVertical } from "lucide-react";
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

  const handleClose = () => {
    setReviewMode(taskId, "closed");
  };

  return (
    <Flex
      id="review-toolbar"
      px="1"
      align="center"
      gap="3"
      style={{
        borderBottom: "1px solid var(--gray-6)",
        background: "var(--color-background)",
        position: "sticky",
        height: "32px",
        top: 0,
        zIndex: 2,
        flexShrink: 0,
      }}
    >
      <Text size="1" weight="medium">
        {fileCount} file{fileCount !== 1 ? "s" : ""} changed
      </Text>

      <Flex align="center" gap="1" ml="auto">
        {onRefresh && (
          <Tooltip content="Refresh diff">
            <Button size="icon-sm" onClick={onRefresh} className="rounded-xs">
              <ArrowsClockwise size={14} />
            </Button>
          </Tooltip>
        )}

        <Tooltip content={viewMode === "split" ? "Split view" : "Columns view"}>
          <Button
            size="icon-sm"
            onClick={toggleViewMode}
            className="rounded-xs"
          >
            {viewMode === "split" ? <Rows size={14} /> : <Columns size={14} />}
          </Button>
        </Tooltip>

        <Tooltip content={allExpanded ? "Collapse all" : "Expand all"}>
          <Button
            size="icon-sm"
            onClick={allExpanded ? onCollapseAll : onExpandAll}
            className="rounded-xs"
          >
            {allExpanded ? (
              <FoldVertical size={12} />
            ) : (
              <UnfoldVertical size={12} />
            )}
          </Button>
        </Tooltip>

        <Tooltip
          content={
            reviewMode === "expanded" ? "Collapse review" : "Expand review"
          }
        >
          <Button
            size="icon-sm"
            onClick={handleToggleExpand}
            aria-selected={reviewMode === "expanded"}
            className="rounded-xs"
          >
            {reviewMode === "expanded" ? (
              <Minimize size={12} />
            ) : (
              <Maximize size={12} />
            )}
          </Button>
        </Tooltip>

        <Separator orientation="vertical" size="1" />

        <DiffSettingsMenu />

        <Tooltip content="Close review">
          <Button size="icon-sm" onClick={handleClose} className="rounded-xs">
            <X size={14} />
          </Button>
        </Tooltip>
      </Flex>
    </Flex>
  );
});
