import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { useInboxReports } from "@features/inbox/hooks/useInboxReports";
import { getSessionService } from "@features/sessions/service/service";
import { useArchiveTask } from "@features/tasks/hooks/useArchiveTask";
import { useTasks, useUpdateTask } from "@features/tasks/hooks/useTasks";
import { useWorkspaces } from "@features/workspace/hooks/useWorkspace";
import { useTaskContextMenu } from "@hooks/useTaskContextMenu";
import { Box, Flex } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { memo, useCallback, useEffect, useRef } from "react";
import { usePinnedTasks } from "../hooks/usePinnedTasks";
import { useSidebarData } from "../hooks/useSidebarData";
import { useTaskViewed } from "../hooks/useTaskViewed";
import { InboxItem, NewTaskItem } from "./items/HomeItem";
import { SidebarItem } from "./SidebarItem";
import { TaskListView } from "./TaskListView";

function SidebarMenuComponent() {
  const { view, navigateToTask, navigateToTaskInput, navigateToInbox } =
    useNavigationStore();

  const { data: allTasks = [] } = useTasks();

  const { data: workspaces = {} } = useWorkspaces();
  const { markAsViewed } = useTaskViewed();

  const { showContextMenu, editingTaskId, setEditingTaskId } =
    useTaskContextMenu();
  const { archiveTask } = useArchiveTask();
  const { togglePin } = usePinnedTasks();

  const sidebarData = useSidebarData({
    activeView: view,
  });
  const { data: inboxSignals } = useInboxReports({ status: "ready" });
  const inboxSignalCount =
    inboxSignals?.count ?? inboxSignals?.results?.length ?? 0;

  const previousTaskIdRef = useRef<string | null>(null);

  useEffect(() => {
    const currentTaskId =
      view.type === "task-detail" && view.data ? view.data.id : null;

    if (
      previousTaskIdRef.current &&
      previousTaskIdRef.current !== currentTaskId
    ) {
      markAsViewed(previousTaskIdRef.current);
    }

    if (currentTaskId) {
      markAsViewed(currentTaskId);
    }

    previousTaskIdRef.current = currentTaskId;
  }, [view, markAsViewed]);

  const taskMap = new Map<string, Task>();
  for (const task of allTasks) {
    taskMap.set(task.id, task);
  }

  const handleNewTaskClick = () => {
    navigateToTaskInput();
  };

  const handleInboxClick = () => {
    navigateToInbox();
  };

  const handleTaskClick = (taskId: string) => {
    const task = taskMap.get(taskId);
    if (task) {
      navigateToTask(task);
    }
  };

  const handleTaskContextMenu = (
    taskId: string,
    e: React.MouseEvent,
    isPinned: boolean,
  ) => {
    const task = taskMap.get(taskId);
    if (task) {
      const workspace = workspaces[taskId];
      const effectivePath = workspace?.worktreePath ?? workspace?.folderPath;
      showContextMenu(task, e, {
        worktreePath: effectivePath ?? undefined,
        isPinned,
        onTogglePin: () => togglePin(taskId),
      });
    }
  };

  const handleTaskArchive = async (taskId: string) => {
    await archiveTask({ taskId });
  };

  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();
  const log = logger.scope("sidebar-menu");

  const handleTaskDoubleClick = useCallback(
    (taskId: string) => {
      setEditingTaskId(taskId);
    },
    [setEditingTaskId],
  );

  const handleTaskEditSubmit = useCallback(
    async (taskId: string, newTitle: string) => {
      setEditingTaskId(null);

      // Optimistically update task title in all cached task lists
      queryClient.setQueriesData<Task[]>(
        { queryKey: ["tasks", "list"] },
        (old) =>
          old?.map((task) =>
            task.id === taskId
              ? { ...task, title: newTitle, title_manually_set: true }
              : task,
          ),
      );

      // Sync to session store so notifications use the updated title
      getSessionService().updateSessionTaskTitle(taskId, newTitle);

      try {
        await updateTask.mutateAsync({
          taskId,
          updates: { title: newTitle, title_manually_set: true },
        });
      } catch (error) {
        log.error("Failed to rename task", error);
        // Refetch to revert optimistic update on failure
        queryClient.invalidateQueries({ queryKey: ["tasks", "list"] });
      }
    },
    [setEditingTaskId, updateTask, queryClient, log],
  );

  const handleTaskEditCancel = useCallback(() => {
    setEditingTaskId(null);
  }, [setEditingTaskId]);

  return (
    <Box height="100%" position="relative">
      <Box
        style={{
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        <Flex direction="column" py="2">
          <Box mb="2">
            <NewTaskItem
              isActive={sidebarData.isHomeActive}
              onClick={handleNewTaskClick}
            />
          </Box>

          <Box mb="2">
            <InboxItem
              isActive={sidebarData.isInboxActive}
              onClick={handleInboxClick}
              signalCount={inboxSignalCount}
            />
          </Box>

          {sidebarData.isLoading ? (
            <SidebarItem
              depth={0}
              icon={<DotsCircleSpinner size={12} className="text-gray-10" />}
              label="Loading tasks..."
            />
          ) : (
            <TaskListView
              pinnedTasks={sidebarData.pinnedTasks}
              flatTasks={sidebarData.flatTasks}
              groupedTasks={sidebarData.groupedTasks}
              activeTaskId={sidebarData.activeTaskId}
              editingTaskId={editingTaskId}
              onTaskClick={handleTaskClick}
              onTaskDoubleClick={handleTaskDoubleClick}
              onTaskContextMenu={handleTaskContextMenu}
              onTaskArchive={handleTaskArchive}
              onTaskTogglePin={togglePin}
              onTaskEditSubmit={handleTaskEditSubmit}
              onTaskEditCancel={handleTaskEditCancel}
              hasMore={sidebarData.hasMore}
            />
          )}
        </Flex>
      </Box>
    </Box>
  );
}

export const SidebarMenu = memo(SidebarMenuComponent);
