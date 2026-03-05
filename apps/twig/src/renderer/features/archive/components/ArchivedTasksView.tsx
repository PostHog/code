import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { Tooltip } from "@components/ui/Tooltip";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import {
  Cloud as CloudIcon,
  GitBranch as GitBranchIcon,
  Laptop as LaptopIcon,
} from "@phosphor-icons/react";
import { Box, Button, Dialog, Flex, Table, Text } from "@radix-ui/themes";
import { trpcReact, trpcVanilla } from "@renderer/trpc";
import type { Task, WorkspaceMode } from "@shared/types";
import type { ArchivedTask } from "@shared/types/archive";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@utils/toast";
import { useMemo, useState } from "react";

const BRANCH_NOT_FOUND_PATTERN = /Branch '(.+)' does not exist/;

function formatRelativeDate(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "just now";
  }
  if (diffMinutes < 60) {
    return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
  }
  if (diffHours < 24) {
    return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  }
  if (diffDays < 7) {
    return diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  }

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getRepoName(repository: string | null | undefined): string {
  return repository?.split("/").pop() ?? "—";
}

const ICON_SIZE = 12;

function ModeIcon({ mode }: { mode: WorkspaceMode }) {
  if (mode === "cloud") {
    return (
      <Tooltip content="Cloud">
        <span className="flex items-center justify-center">
          <CloudIcon size={ICON_SIZE} className="text-gray-10" />
        </span>
      </Tooltip>
    );
  }
  if (mode === "worktree") {
    return (
      <Tooltip content="Worktree">
        <span className="flex items-center justify-center">
          <GitBranchIcon size={ICON_SIZE} className="text-gray-10" />
        </span>
      </Tooltip>
    );
  }
  return (
    <Tooltip content="Local">
      <span className="flex items-center justify-center">
        <LaptopIcon size={ICON_SIZE} className="text-gray-10" />
      </span>
    </Tooltip>
  );
}

interface BranchNotFoundPrompt {
  taskId: string;
  branchName: string;
}

export interface ArchivedTaskWithDetails {
  archived: ArchivedTask;
  task: Task | null;
}

export interface ArchivedTasksViewPresentationProps {
  items: ArchivedTaskWithDetails[];
  isLoading: boolean;
  branchNotFound: BranchNotFoundPrompt | null;
  onUnarchive: (taskId: string) => void;
  onDelete: (taskId: string, taskTitle: string) => void;
  onContextMenu: (item: ArchivedTaskWithDetails, e: React.MouseEvent) => void;
  onBranchNotFoundClose: () => void;
  onRecreateBranch: () => void;
}

export function ArchivedTasksViewPresentation({
  items,
  isLoading,
  branchNotFound,
  onUnarchive,
  onDelete,
  onContextMenu,
  onBranchNotFoundClose,
  onRecreateBranch,
}: ArchivedTasksViewPresentationProps) {
  return (
    <Flex direction="column" height="100%">
      <Box className="flex-1 overflow-y-auto">
        {isLoading ? (
          <Flex align="center" justify="center" gap="2" py="8">
            <DotsCircleSpinner size={16} className="text-gray-10" />
            <Text className="font-mono text-[12px] text-gray-10">
              Loading archived tasks...
            </Text>
          </Flex>
        ) : items.length === 0 ? (
          <Flex align="center" justify="center" py="8">
            <Text className="font-mono text-[12px] text-gray-10">
              No archived tasks
            </Text>
          </Flex>
        ) : (
          <Table.Root
            size="1"
            className="[&_td]:!py-1.5 [&_th]:!py-1.5 [&_tbody_tr:hover]:bg-gray-4 [&_td]:align-middle [&_th]:align-middle"
          >
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell className="font-mono font-normal text-[12px] text-gray-11">
                  Title
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell className="font-mono font-normal text-[12px] text-gray-11">
                  Created
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell className="font-mono font-normal text-[12px] text-gray-11">
                  Repository
                </Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell />
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {items.map((item) => (
                <Table.Row
                  key={item.archived.taskId}
                  onContextMenu={(e) => onContextMenu(item, e)}
                  className="group"
                >
                  <Table.Cell>
                    <Flex align="center" gap="2">
                      <ModeIcon mode={item.archived.mode} />
                      <Text className="block max-w-[600px] truncate font-mono text-[12px]">
                        {item.task?.title ?? "Unknown task"}
                      </Text>
                    </Flex>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="block whitespace-nowrap font-mono text-[12px] text-gray-11">
                      {formatRelativeDate(item.task?.created_at)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="block max-w-[300px] truncate font-mono text-[12px] text-gray-11">
                      {getRepoName(item.task?.repository)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Flex gap="2" className="invisible group-hover:visible">
                      <Button
                        variant="outline"
                        color="gray"
                        size="1"
                        onClick={() => onUnarchive(item.archived.taskId)}
                      >
                        Unarchive
                      </Button>
                      <Button
                        variant="outline"
                        color="red"
                        size="1"
                        onClick={() =>
                          onDelete(
                            item.archived.taskId,
                            item.task?.title ?? "Unknown task",
                          )
                        }
                      >
                        Delete
                      </Button>
                    </Flex>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        )}
      </Box>

      <Dialog.Root
        open={branchNotFound !== null}
        onOpenChange={(open) => {
          if (!open) onBranchNotFoundClose();
        }}
      >
        <Dialog.Content maxWidth="420px" size="1">
          <Dialog.Title size="2">Unarchive to new branch?</Dialog.Title>
          <Dialog.Description size="1">
            <Text size="1" color="gray">
              This workspace was last on{" "}
              <Text size="1" weight="medium">
                {branchNotFound?.branchName}
              </Text>
              , but that branch has been deleted or renamed.
            </Text>
          </Dialog.Description>
          <Flex justify="end" gap="3" mt="3">
            <Dialog.Close>
              <Button variant="soft" color="gray" size="1">
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="1" onClick={onRecreateBranch}>
              Unarchive to new branch
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}

export function ArchivedTasksView() {
  const { data: archivedTasks = [], isLoading: isLoadingArchived } =
    trpcReact.archive.list.useQuery();
  const { data: tasks = [], isLoading: isLoadingTasks } = useTasks();
  const queryClient = useQueryClient();
  const trpcUtils = trpcReact.useUtils();

  useSetHeaderContent(
    <Text size="1" weight="medium" className="font-mono text-[12px]">
      Archived tasks
    </Text>,
  );

  const [branchNotFound, setBranchNotFound] =
    useState<BranchNotFoundPrompt | null>(null);

  const items = useMemo(() => {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    return archivedTasks.map((archived) => ({
      archived,
      task: taskMap.get(archived.taskId) ?? null,
    }));
  }, [archivedTasks, tasks]);

  const isLoading = isLoadingArchived || isLoadingTasks;

  const invalidateArchiveQueries = async () => {
    await Promise.all([
      queryClient.refetchQueries({ queryKey: ["archivedTaskIds"] }),
      queryClient.refetchQueries({ queryKey: [["archive"]] }),
      queryClient.refetchQueries({ queryKey: ["tasks"] }),
    ]);
  };

  const handleUnarchive = async (taskId: string) => {
    const item = items.find((i) => i.archived.taskId === taskId);
    const task = item?.task;

    try {
      await trpcVanilla.archive.unarchive.mutate({ taskId });
      await trpcUtils.workspace.getAll.invalidate();
      await invalidateArchiveQueries();
      toast.success("Task unarchived", {
        action: task
          ? {
              label: "View task",
              onClick: () => useNavigationStore.getState().navigateToTask(task),
            }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(BRANCH_NOT_FOUND_PATTERN);
      if (match) {
        setBranchNotFound({ taskId, branchName: match[1] });
      } else {
        toast.error(`Failed to unarchive task: ${message}`);
      }
    }
  };

  const executeDelete = async (taskId: string) => {
    try {
      await trpcVanilla.archive.delete.mutate({ taskId });
      invalidateArchiveQueries();
      toast.success("Task deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete task: ${message}`);
    }
  };

  const handleDelete = async (taskId: string, taskTitle: string) => {
    const { confirmed } =
      await trpcVanilla.contextMenu.confirmDeleteArchivedTask.mutate({
        taskTitle,
      });
    if (!confirmed) return;

    await executeDelete(taskId);
  };

  const handleContextMenu = async (
    item: ArchivedTaskWithDetails,
    e: React.MouseEvent,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const taskTitle = item.task?.title ?? "Unknown task";

    try {
      const result =
        await trpcVanilla.contextMenu.showArchivedTaskContextMenu.mutate({
          taskTitle,
        });

      if (!result.action) return;

      switch (result.action.type) {
        case "restore":
          await handleUnarchive(item.archived.taskId);
          break;
        case "delete":
          await executeDelete(item.archived.taskId);
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Context menu error: ${message}`);
    }
  };

  const handleRecreateBranch = async () => {
    if (!branchNotFound) return;
    const { taskId } = branchNotFound;
    const item = items.find((i) => i.archived.taskId === taskId);
    const task = item?.task;
    setBranchNotFound(null);
    try {
      await trpcVanilla.archive.unarchive.mutate({
        taskId,
        recreateBranch: true,
      });
      await trpcUtils.workspace.getAll.invalidate();
      await invalidateArchiveQueries();
      toast.success("Task unarchived", {
        action: task
          ? {
              label: "View task",
              onClick: () => useNavigationStore.getState().navigateToTask(task),
            }
          : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to unarchive task: ${message}`);
    }
  };

  return (
    <ArchivedTasksViewPresentation
      items={items}
      isLoading={isLoading}
      branchNotFound={branchNotFound}
      onUnarchive={handleUnarchive}
      onDelete={handleDelete}
      onContextMenu={handleContextMenu}
      onBranchNotFoundClose={() => setBranchNotFound(null)}
      onRecreateBranch={handleRecreateBranch}
    />
  );
}
