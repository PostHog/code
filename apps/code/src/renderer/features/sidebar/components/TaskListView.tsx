import { PointerSensor } from "@dnd-kit/dom";
import type { DragDropEvents } from "@dnd-kit/react";
import { DragDropProvider } from "@dnd-kit/react";
import { useFolders } from "@features/folders/hooks/useFolders";
import {
  FolderOpenIcon,
  FolderSimple,
  FunnelSimple as FunnelSimpleIcon,
} from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  MenuLabel,
} from "@posthog/quill";
import { Flex, Text } from "@radix-ui/themes";
import { useWorkspace } from "@renderer/features/workspace/hooks/useWorkspace";
import { normalizeRepoKey } from "@shared/utils/repo";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect } from "react";
import type { TaskData, TaskGroup } from "../hooks/useSidebarData";
import { useSidebarStore } from "../stores/sidebarStore";
import { DraggableFolder } from "./DraggableFolder";
import { TaskItem } from "./items/TaskItem";
import { SidebarSection } from "./SidebarSection";

interface TaskListViewProps {
  pinnedTasks: TaskData[];
  flatTasks: TaskData[];
  groupedTasks: TaskGroup[];
  activeTaskId: string | null;
  editingTaskId: string | null;
  onTaskClick: (taskId: string) => void;
  onTaskDoubleClick: (taskId: string) => void;
  onTaskContextMenu: (
    taskId: string,
    e: React.MouseEvent,
    isPinned: boolean,
  ) => void;
  onTaskArchive: (taskId: string) => void;
  onTaskTogglePin: (taskId: string) => void;
  onTaskEditSubmit: (taskId: string, newTitle: string) => void;
  onTaskEditCancel: () => void;
  hasMore: boolean;
}

function SectionLabel({
  label,
  endContent,
}: {
  label: string;
  endContent?: React.ReactNode;
}) {
  return (
    <MenuLabel
      className="flex items-center justify-between py-0 pr-0"
      htmlFor="null"
    >
      {label}
      {endContent ? <span>{endContent}</span> : null}
    </MenuLabel>
  );
}

function TaskRow({
  task,
  isActive,
  isEditing,
  onClick,
  onDoubleClick,
  onContextMenu,
  onArchive,
  onTogglePin,
  onEditSubmit,
  onEditCancel,
  timestamp,
  depth = 0,
}: {
  task: TaskData;
  isActive: boolean;
  isEditing: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent, isPinned: boolean) => void;
  onArchive: () => void;
  onTogglePin: () => void;
  onEditSubmit: (newTitle: string) => void;
  onEditCancel: () => void;
  timestamp: number;
  depth?: number;
}) {
  const workspace = useWorkspace(task.id);
  const effectiveMode =
    workspace?.mode ??
    (task.taskRunEnvironment === "cloud" ? "cloud" : undefined);

  return (
    <TaskItem
      depth={depth}
      taskId={task.id}
      label={task.title}
      isActive={isActive}
      isEditing={isEditing}
      workspaceMode={effectiveMode}
      worktreePath={workspace?.worktreePath ?? undefined}
      isSuspended={task.isSuspended}
      isGenerating={task.isGenerating}
      isUnread={task.isUnread}
      isPinned={task.isPinned}
      needsPermission={task.needsPermission}
      taskRunStatus={task.taskRunStatus}
      timestamp={timestamp}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => onContextMenu(e, task.isPinned)}
      onArchive={onArchive}
      onTogglePin={onTogglePin}
      onEditSubmit={onEditSubmit}
      onEditCancel={onEditCancel}
    />
  );
}

function TaskFilterMenu() {
  const organizeMode = useSidebarStore((state) => state.organizeMode);
  const sortMode = useSidebarStore((state) => state.sortMode);
  const showAllUsers = useSidebarStore((state) => state.showAllUsers);
  const setOrganizeMode = useSidebarStore((state) => state.setOrganizeMode);
  const setSortMode = useSidebarStore((state) => state.setSortMode);
  const setShowAllUsers = useSidebarStore((state) => state.setShowAllUsers);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" aria-label="Filter tasks" size="icon-sm">
            <FunnelSimpleIcon size={14} />
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="min-w-xs"
      >
        <MenuLabel>Organize</MenuLabel>
        <DropdownMenuRadioGroup
          value={organizeMode}
          onValueChange={(value) =>
            setOrganizeMode(value as typeof organizeMode)
          }
        >
          <DropdownMenuRadioItem value="by-project">
            By project
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="chronological">
            Chronological list
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <MenuLabel>Sort by</MenuLabel>
        <DropdownMenuRadioGroup
          value={sortMode}
          onValueChange={(value) => setSortMode(value as typeof sortMode)}
        >
          <DropdownMenuRadioItem value="created">Created</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="updated">Updated</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        {import.meta.env.DEV && (
          <>
            <DropdownMenuSeparator />

            <MenuLabel>Show</MenuLabel>
            <DropdownMenuRadioGroup
              value={showAllUsers ? "all" : "mine"}
              onValueChange={(value) => setShowAllUsers(value === "all")}
            >
              <DropdownMenuRadioItem value="mine">
                My tasks
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="all">
                All tasks
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskListView({
  pinnedTasks,
  flatTasks,
  groupedTasks,
  activeTaskId,
  editingTaskId,
  onTaskClick,
  onTaskDoubleClick,
  onTaskContextMenu,
  onTaskArchive,
  onTaskTogglePin,
  onTaskEditSubmit,
  onTaskEditCancel,
  hasMore,
}: TaskListViewProps) {
  const organizeMode = useSidebarStore((state) => state.organizeMode);
  const sortMode = useSidebarStore((state) => state.sortMode);
  const collapsedSections = useSidebarStore((state) => state.collapsedSections);
  const toggleSection = useSidebarStore((state) => state.toggleSection);
  const loadMoreHistory = useSidebarStore((state) => state.loadMoreHistory);
  const resetHistoryVisibleCount = useSidebarStore(
    (state) => state.resetHistoryVisibleCount,
  );
  const { folders } = useFolders();
  const navigateToTaskInput = useNavigationStore(
    (state) => state.navigateToTaskInput,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when filters change
  useEffect(() => {
    resetHistoryVisibleCount();
  }, [organizeMode, sortMode, resetHistoryVisibleCount]);

  const handleDragOver: DragDropEvents["dragover"] = useCallback((event) => {
    const sourceId = event.operation.source?.id;
    const targetId = event.operation.target?.id;
    if (!sourceId || !targetId || sourceId === targetId) return;

    const currentOrder = useSidebarStore.getState().folderOrder;
    const sourceIndex = currentOrder.indexOf(String(sourceId));
    const targetIndex = currentOrder.indexOf(String(targetId));
    if (sourceIndex === -1 || targetIndex === -1) return;
    if (sourceIndex === targetIndex) return;

    useSidebarStore.getState().reorderFolders(sourceIndex, targetIndex);
  }, []);

  const timestampKey: "lastActivityAt" | "createdAt" =
    sortMode === "updated" ? "lastActivityAt" : "createdAt";

  return (
    <Flex direction="column">
      {pinnedTasks.length > 0 && (
        <>
          <SectionLabel label="Pinned" />
          {pinnedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              isEditing={editingTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onDoubleClick={() => onTaskDoubleClick(task.id)}
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onArchive={() => onTaskArchive(task.id)}
              onTogglePin={() => onTaskTogglePin(task.id)}
              onEditSubmit={(newTitle) => onTaskEditSubmit(task.id, newTitle)}
              onEditCancel={onTaskEditCancel}
              timestamp={task[timestampKey]}
            />
          ))}
        </>
      )}

      <SectionLabel label="Tasks" endContent={<TaskFilterMenu />} />

      {pinnedTasks.length === 0 &&
      flatTasks.length === 0 &&
      groupedTasks.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <Text size="2" className="text-gray-11">
            No tasks yet
          </Text>
          <button
            type="button"
            className="rounded-md bg-gray-3 px-3 py-1.5 text-[13px] text-gray-12 transition-colors hover:bg-gray-4"
            onClick={() => navigateToTaskInput()}
          >
            New task
          </button>
        </div>
      ) : organizeMode === "by-project" ? (
        <DragDropProvider
          onDragOver={handleDragOver}
          sensors={[
            {
              plugin: PointerSensor,
              options: {
                activationConstraints: {
                  distance: { value: 5 },
                },
              },
            },
          ]}
        >
          <Flex direction="column">
            {groupedTasks.map((group, index) => {
              const isExpanded = !collapsedSections.has(group.id);
              const folder = folders.find(
                (f) =>
                  (f.remoteUrl &&
                    normalizeRepoKey(f.remoteUrl).toLowerCase() ===
                      normalizeRepoKey(group.id).toLowerCase()) ||
                  f.path === group.id,
              );
              const groupFolderId =
                folder?.id ?? group.tasks.find((t) => t.folderId)?.folderId;
              return (
                <DraggableFolder key={group.id} id={group.id} index={index}>
                  <SidebarSection
                    id={group.id}
                    label={folder?.name ?? group.name}
                    icon={
                      isExpanded ? (
                        <FolderOpenIcon size={14} className="text-gray-10" />
                      ) : (
                        <FolderSimple size={14} className="text-gray-10" />
                      )
                    }
                    isExpanded={isExpanded}
                    onToggle={() => toggleSection(group.id)}
                    addSpacingBefore={false}
                    tooltipContent={folder?.path ?? group.id}
                    onNewTask={() => {
                      if (groupFolderId) {
                        navigateToTaskInput(groupFolderId);
                      } else {
                        navigateToTaskInput();
                      }
                    }}
                    newTaskTooltip={`Start new task in ${folder?.name ?? group.name}`}
                  >
                    {group.tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        isActive={activeTaskId === task.id}
                        isEditing={editingTaskId === task.id}
                        onClick={() => onTaskClick(task.id)}
                        onDoubleClick={() => onTaskDoubleClick(task.id)}
                        onContextMenu={(e, isPinned) =>
                          onTaskContextMenu(task.id, e, isPinned)
                        }
                        onArchive={() => onTaskArchive(task.id)}
                        onTogglePin={() => onTaskTogglePin(task.id)}
                        onEditSubmit={(newTitle) =>
                          onTaskEditSubmit(task.id, newTitle)
                        }
                        onEditCancel={onTaskEditCancel}
                        timestamp={task[timestampKey]}
                        depth={1}
                      />
                    ))}
                  </SidebarSection>
                </DraggableFolder>
              );
            })}
          </Flex>
        </DragDropProvider>
      ) : (
        <Flex direction="column" gap="1px">
          {flatTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              isActive={activeTaskId === task.id}
              isEditing={editingTaskId === task.id}
              onClick={() => onTaskClick(task.id)}
              onDoubleClick={() => onTaskDoubleClick(task.id)}
              onContextMenu={(e, isPinned) =>
                onTaskContextMenu(task.id, e, isPinned)
              }
              onArchive={() => onTaskArchive(task.id)}
              onTogglePin={() => onTaskTogglePin(task.id)}
              onEditSubmit={(newTitle) => onTaskEditSubmit(task.id, newTitle)}
              onEditCancel={onTaskEditCancel}
              timestamp={task[timestampKey]}
            />
          ))}
          {hasMore && (
            <div className="px-2 py-2">
              <button
                type="button"
                className="w-full rounded-md px-2 py-1 text-left text-[13px] text-gray-11 transition-colors hover:bg-gray-3"
                onClick={loadMoreHistory}
              >
                Show more
              </button>
            </div>
          )}
        </Flex>
      )}
    </Flex>
  );
}
