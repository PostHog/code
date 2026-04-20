import { useArchivedTaskIds } from "@features/archive/hooks/useArchivedTaskIds";
import { useSessions } from "@features/sessions/stores/sessionStore";
import { useSuspendedTaskIds } from "@features/suspension/hooks/useSuspendedTaskIds";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useWorkspaces } from "@features/workspace/hooks/useWorkspace";
import { getTaskRepository, parseRepository } from "@renderer/utils/repository";
import type { Task, TaskRunStatus } from "@shared/types";
import { useEffect, useMemo, useRef } from "react";
import { useSidebarStore } from "../stores/sidebarStore";
import type { SortMode } from "../types";
import { usePinnedTasks } from "./usePinnedTasks";
import { useTaskViewed } from "./useTaskViewed";

export interface TaskRepositoryInfo {
  fullPath: string;
  name: string;
}

export interface TaskData {
  id: string;
  title: string;
  createdAt: number;
  lastActivityAt: number;
  isGenerating: boolean;
  isUnread: boolean;
  isPinned: boolean;
  needsPermission: boolean;
  repository: TaskRepositoryInfo | null;
  isSuspended: boolean;
  folderId?: string;
  taskRunStatus?: TaskRunStatus;
  taskRunEnvironment?: "local" | "cloud";
}

export interface TaskGroup {
  id: string;
  name: string;
  tasks: TaskData[];
}

export interface SidebarData {
  isHomeActive: boolean;
  isInboxActive: boolean;
  isCommandCenterActive: boolean;
  isSkillsActive: boolean;
  isLoading: boolean;
  activeTaskId: string | null;
  pinnedTasks: TaskData[];
  flatTasks: TaskData[];
  groupedTasks: TaskGroup[];
  totalCount: number;
  hasMore: boolean;
}

interface ViewState {
  type:
    | "task-detail"
    | "task-input"
    | "settings"
    | "folder-settings"
    | "inbox"
    | "archived"
    | "command-center"
    | "skills";
  data?: Task;
}

interface UseSidebarDataProps {
  activeView: ViewState;
}

function getRepositoryInfo(
  task: Task,
  folderPath?: string,
): TaskRepositoryInfo | null {
  const repository = getTaskRepository(task);
  if (repository) {
    const parsed = parseRepository(repository);
    return {
      fullPath: repository,
      name: parsed?.repoName ?? repository,
    };
  }
  if (folderPath) {
    const name = folderPath.split("/").pop() ?? folderPath;
    return {
      fullPath: folderPath,
      name,
    };
  }
  return null;
}

function getSortValue(task: TaskData, sortMode: SortMode): number {
  return sortMode === "updated" ? task.lastActivityAt : task.createdAt;
}

function sortTasks(tasks: TaskData[], sortMode: SortMode): TaskData[] {
  return tasks.sort(
    (a, b) => getSortValue(b, sortMode) - getSortValue(a, sortMode),
  );
}

function groupByRepository(
  tasks: TaskData[],
  folderOrder: string[],
): TaskGroup[] {
  const groupMap = new Map<string, TaskGroup>();

  for (const task of tasks) {
    const repository = task.repository;
    const groupId = repository?.fullPath ?? "other";
    const groupName = repository?.name ?? "Other";

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, { id: groupId, name: groupName, tasks: [] });
    }

    groupMap.get(groupId)?.tasks.push(task);
  }

  const groups = Array.from(groupMap.values());

  if (folderOrder.length === 0) {
    return groups.sort((a, b) => a.name.localeCompare(b.name));
  }

  return groups.sort((a, b) => {
    const aIndex = folderOrder.indexOf(a.id);
    const bIndex = folderOrder.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) {
      return a.name.localeCompare(b.name);
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });
}

export function useSidebarData({
  activeView,
}: UseSidebarDataProps): SidebarData {
  const showAllUsers = useSidebarStore((state) => state.showAllUsers);
  const { data: rawTasks = [], isLoading: isLoadingTasks } = useTasks({
    showAllUsers,
  });
  const { data: workspaces, isFetched: isWorkspacesFetched } = useWorkspaces();
  const archivedTaskIds = useArchivedTaskIds();
  const suspendedTaskIds = useSuspendedTaskIds();
  const isLoading = isLoadingTasks || !isWorkspacesFetched;
  const allTasks = useMemo(
    () =>
      rawTasks.filter(
        (task) =>
          !archivedTaskIds.has(task.id) &&
          (showAllUsers || !!workspaces?.[task.id]),
      ),
    [rawTasks, archivedTaskIds, workspaces, showAllUsers],
  );
  const sessions = useSessions();
  const { timestamps } = useTaskViewed();
  const historyVisibleCount = useSidebarStore(
    (state) => state.historyVisibleCount,
  );
  const { pinnedTaskIds } = usePinnedTasks();
  const organizeMode = useSidebarStore((state) => state.organizeMode);
  const sortMode = useSidebarStore((state) => state.sortMode);
  const folderOrder = useSidebarStore((state) => state.folderOrder);

  const isHomeActive = activeView.type === "task-input";
  const isInboxActive = activeView.type === "inbox";
  const isCommandCenterActive = activeView.type === "command-center";
  const isSkillsActive = activeView.type === "skills";

  const activeTaskId =
    activeView.type === "task-detail" && activeView.data
      ? activeView.data.id
      : null;

  const sessionByTaskId = useMemo(() => {
    const map = new Map<string, (typeof sessions)[string]>();
    for (const session of Object.values(sessions)) {
      if (session.taskId) {
        map.set(session.taskId, session);
      }
    }
    return map;
  }, [sessions]);

  const taskData = useMemo(() => {
    return allTasks.map((task) => {
      const session = sessionByTaskId.get(task.id);
      const workspace = workspaces?.[task.id];
      const apiUpdatedAt = new Date(task.updated_at).getTime();
      const taskTimestamps = timestamps[task.id];
      const localActivity = taskTimestamps?.lastActivityAt;
      const lastActivityAt = localActivity
        ? Math.max(apiUpdatedAt, localActivity)
        : apiUpdatedAt;
      const createdAt = new Date(task.created_at).getTime();

      const taskLastViewedAt = taskTimestamps?.lastViewedAt;
      const isUnread =
        taskLastViewedAt != null && lastActivityAt > taskLastViewedAt;

      return {
        id: task.id,
        title: task.title,
        createdAt,
        lastActivityAt,
        isGenerating: session?.isPromptPending ?? false,
        isUnread,
        isPinned: pinnedTaskIds.has(task.id),
        isSuspended: suspendedTaskIds.has(task.id),
        needsPermission: (session?.pendingPermissions?.size ?? 0) > 0,
        repository: getRepositoryInfo(task, workspace?.folderPath),
        folderId: workspace?.folderId || undefined,
        taskRunStatus: session?.cloudStatus ?? task.latest_run?.status,
        taskRunEnvironment: task.latest_run?.environment,
      };
    });
  }, [
    allTasks,
    timestamps,
    pinnedTaskIds,
    suspendedTaskIds,
    sessionByTaskId,
    workspaces,
  ]);

  const pinnedTasks = useMemo(() => {
    const pinned = taskData.filter((task) => task.isPinned);
    return sortTasks(pinned, sortMode);
  }, [taskData, sortMode]);

  const unpinnedTasks = useMemo(
    () => taskData.filter((task) => !task.isPinned),
    [taskData],
  );

  const sortedUnpinnedTasks = useMemo(
    () => sortTasks([...unpinnedTasks], sortMode),
    [unpinnedTasks, sortMode],
  );

  const totalCount = unpinnedTasks.length;
  const hasMore =
    organizeMode === "chronological" &&
    sortedUnpinnedTasks.length > historyVisibleCount;

  const flatTasks = useMemo(() => {
    if (organizeMode !== "chronological") {
      return sortedUnpinnedTasks;
    }
    return sortedUnpinnedTasks.slice(0, historyVisibleCount);
  }, [organizeMode, sortedUnpinnedTasks, historyVisibleCount]);

  const groupedTasks = useMemo(
    () => groupByRepository(sortedUnpinnedTasks, folderOrder),
    [sortedUnpinnedTasks, folderOrder],
  );

  const groupIdsRef = useRef<string[]>([]);
  useEffect(() => {
    if (groupedTasks.length === 0) return;
    const groupIds = groupedTasks.map((g) => g.id);
    const prev = groupIdsRef.current;
    if (
      groupIds.length === prev.length &&
      groupIds.every((id, i) => id === prev[i])
    ) {
      return;
    }
    groupIdsRef.current = groupIds;
    useSidebarStore.getState().syncFolderOrder(groupIds);
  }, [groupedTasks]);

  return {
    isHomeActive,
    isInboxActive,
    isCommandCenterActive,
    isSkillsActive,
    isLoading,
    activeTaskId,
    pinnedTasks,
    flatTasks,
    groupedTasks,
    totalCount,
    hasMore,
  };
}
