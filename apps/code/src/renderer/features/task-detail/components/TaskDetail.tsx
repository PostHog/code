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
import { Box, Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useEffect, useMemo, useState } from "react";
import { useHotkeys, useHotkeysContext } from "react-hotkeys-hook";
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
    if (parsed.type === "file" || parsed.type === "diff") {
      return parsed.value;
    }
    return null;
  });

  const openTargetPath =
    activeRelativePath && effectiveRepoPath
      ? `${effectiveRepoPath}/${activeRelativePath}`
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

  const headerContent = useMemo(
    () => (
      <Flex align="center" justify="between" gap="2" width="100%">
        <Flex align="center" gap="2" minWidth="0" overflow="hidden">
          <Text size="1" weight="medium" truncate>
            {task.title}
          </Text>
        </Flex>
        {openTargetPath && <ExternalAppsOpener targetPath={openTargetPath} />}
      </Flex>
    ),
    [task.title, openTargetPath],
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
