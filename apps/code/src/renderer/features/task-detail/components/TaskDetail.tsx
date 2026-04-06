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
import { useBlurOnEscape } from "@hooks/useBlurOnEscape";
import { useFileWatcher } from "@hooks/useFileWatcher";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Box, Flex, Text, Tooltip } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
import { toast } from "sonner";
import { ExternalAppsOpener } from "./ExternalAppsOpener";

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

  return (
    <Box height="100%">
      <PanelLayout taskId={taskId} task={task} />
      <FilePicker
        open={filePickerOpen}
        onOpenChange={setFilePickerOpen}
        taskId={taskId}
        repoPath={effectiveRepoPath}
      />
    </Box>
  );
}
