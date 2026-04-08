import { CloudReviewPage } from "@features/code-review/components/CloudReviewPage";
import { ReviewPage } from "@features/code-review/components/ReviewPage";
import { useReviewNavigationStore } from "@features/code-review/stores/reviewNavigationStore";
import { FilePicker } from "@features/command/components/FilePicker";
import { PanelLayout } from "@features/panels";
import { usePanelLayoutStore } from "@features/panels/store/panelLayoutStore";
import {
  getLeafPanel,
  parseTabId,
} from "@features/panels/store/panelStoreHelpers";
import { useCwd } from "@features/sidebar/hooks/useCwd";
import { useTaskData } from "@features/task-detail/hooks/useTaskData";
import { useTaskStore } from "@features/tasks/stores/taskStore";
import { useWorkspaceEvents } from "@features/workspace/hooks";
import { useWorkspace } from "@features/workspace/hooks/useWorkspace";
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Box, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import { toast } from "sonner";
import { ExternalAppsOpener } from "./ExternalAppsOpener";

const MIN_REVIEW_WIDTH = 300;

interface TaskDetailProps {
  task: Task;
}

export function TaskDetail({ task: initialTask }: TaskDetailProps) {
  const taskId = initialTask.id;
  const selectTask = useTaskStore((s) => s.selectTask);

  useEffect(() => {
    selectTask(taskId);
    return () => selectTask(null);
  }, [taskId, selectTask]);

  const { task } = useTaskData({ taskId, initialTask });

  const effectiveRepoPath = useCwd(taskId);

  const activeRelativePath = usePanelLayoutStore((state) => {
    const layout = state.getLayout(taskId);
    if (!layout) return null;

    const panelId = layout.focusedPanelId;
    if (!panelId) return null;

    const panel = getLeafPanel(layout.panelTree, panelId);
    if (!panel) return null;

    const parsed = parseTabId(panel.content.activeTabId);
    if (parsed.type === "file") {
      return parsed.value;
    }
    return null;
  });

  const openTargetPath =
    activeRelativePath && effectiveRepoPath
      ? [effectiveRepoPath, activeRelativePath].join("/").replace(/\/+/g, "/")
      : effectiveRepoPath;

  const [filePickerOpen, setFilePickerOpen] = useState(false);

  const { enableScope, disableScope } = useHotkeysContext();

  useEffect(() => {
    enableScope("taskDetail");
    return () => {
      disableScope("taskDetail");
    };
  }, [enableScope, disableScope]);

  useHotkeys("mod+p", () => setFilePickerOpen(true), {
    enableOnContentEditable: true,
    enableOnFormTags: true,
    preventDefault: true,
  });

  useFileWatcher(effectiveRepoPath ?? null, taskId);

  useBlurOnEscape();
  useWorkspaceEvents(taskId);

  const copyTaskId = useCallback(() => {
    navigator.clipboard.writeText(taskId);
    toast.success("Task ID copied");
  }, [taskId]);

  const headerContent = useMemo(
    () => (
      <Flex align="center" justify="between" gap="2" width="100%">
        <Text size="1" weight="medium" truncate style={{ minWidth: 0 }}>
          {task.title}
        </Text>
        <Flex align="center" gap="2" className="shrink-0">
          <Tooltip content="Copy task ID">
            <button
              type="button"
              onClick={copyTaskId}
              className="no-drag cursor-pointer border-0 bg-transparent p-0 font-mono text-[10px] text-gray-9 hover:text-gray-11"
              style={{ lineHeight: "20px" }}
            >
              {taskId}
            </button>
          </Tooltip>
          {openTargetPath && <ExternalAppsOpener targetPath={openTargetPath} />}
        </Flex>
      </Flex>
    ),
    [task.title, taskId, openTargetPath, copyTaskId],
  );

  useSetHeaderContent(headerContent);

  const reviewMode = useReviewNavigationStore(
    (s) => s.reviewModes[taskId] ?? "closed",
  );
  const workspace = useWorkspace(taskId);
  const isCloud =
    workspace?.mode === "cloud" || task.latest_run?.environment === "cloud";

  const isReviewOpen = reviewMode !== "closed";
  const isExpanded = reviewMode === "expanded";

  const containerRef = useRef<HTMLDivElement>(null);
  const [reviewWidth, setReviewWidth] = useState<number | null>(null);
  const isDragging = useRef(false);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;

      const startX = e.clientX;
      const container = containerRef.current;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const startWidth = reviewWidth ?? containerRect.width * 0.5;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const delta = startX - moveEvent.clientX;
        const maxWidth = containerRect.width * 0.5;
        const newWidth = Math.min(
          maxWidth,
          Math.max(MIN_REVIEW_WIDTH, startWidth + delta),
        );
        setReviewWidth(newWidth);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [reviewWidth],
  );

  return (
    <Box height="100%" ref={containerRef}>
      <Flex height="100%">
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            display: isExpanded ? "none" : undefined,
          }}
        >
          <PanelLayout taskId={taskId} task={task} />
        </Box>

        {isReviewOpen && !isExpanded && (
          <Box
            onMouseDown={handleResizeStart}
            style={{
              width: "4px",
              cursor: "col-resize",
              flexShrink: 0,
              background: "transparent",
              borderLeft: "1px solid var(--gray-6)",
              zIndex: 1,
            }}
            className="transition-colors hover:bg-accent-6 active:bg-accent-8"
          />
        )}

        <Box
          style={{
            flex: isExpanded ? 1 : undefined,
            width: isReviewOpen
              ? isExpanded
                ? undefined
                : reviewWidth
                  ? `${reviewWidth}px`
                  : "50%"
              : "0px",
            minWidth: isReviewOpen ? `${MIN_REVIEW_WIDTH}px` : "0px",
            height: "100%",
            overflow: isReviewOpen ? undefined : "hidden",
            visibility: isReviewOpen ? undefined : "hidden",
          }}
        >
          {isCloud ? (
            <CloudReviewPage task={task} />
          ) : (
            <ReviewPage task={task} />
          )}
        </Box>
      </Flex>
      <FilePicker
        open={filePickerOpen}
        onOpenChange={setFilePickerOpen}
        taskId={taskId}
        repoPath={effectiveRepoPath}
      />
    </Box>
  );
}
