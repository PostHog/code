import { DotsCircleSpinner } from "@components/DotsCircleSpinner";
import { useTasks } from "@features/tasks/hooks/useTasks";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Box, Button, Dialog, Flex, Table, Text } from "@radix-ui/themes";
import { trpcReact, trpcVanilla } from "@renderer/trpc";
import type { Task } from "@shared/types";
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
  unarchivingId: string | null;
  branchNotFound: BranchNotFoundPrompt | null;
  onBack: () => void;
  onUnarchive: (taskId: string) => void;
  onDelete: (taskId: string, taskTitle: string) => void;
  onContextMenu: (item: ArchivedTaskWithDetails, e: React.MouseEvent) => void;
  onBranchNotFoundClose: () => void;
  onRecreateBranch: () => void;
}

export function ArchivedTasksViewPresentation({
  items,
  isLoading,
  unarchivingId,
  branchNotFound,
  onBack,
  onUnarchive,
  onDelete,
  onContextMenu,
  onBranchNotFoundClose,
  onRecreateBranch,
}: ArchivedTasksViewPresentationProps) {
  return (
    <Flex direction="column" height="100%">
      <Box className="border-gray-5 border-b bg-gray-1" px="3" py="2">
        <Flex align="center" gap="2">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center rounded p-1 text-gray-11 hover:bg-gray-3"
          >
            <ArrowLeftIcon size={14} />
          </button>
          <Text size="1" weight="medium" className="font-mono text-[12px]">
            Archived tasks
          </Text>
        </Flex>
      </Box>

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
          <Table.Root size="1">
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
                    <Text className="font-mono text-[12px]">
                      {item.task?.title ?? "Unknown task"}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="font-mono text-[12px] text-gray-11">
                      {formatRelativeDate(item.task?.created_at)}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Text className="font-mono text-[12px] text-gray-11">
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
                        disabled={unarchivingId === item.archived.taskId}
                      >
                        Restore
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
                        disabled={unarchivingId === item.archived.taskId}
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
          <Dialog.Title size="2">Restore to new branch?</Dialog.Title>
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
              Restore to new branch
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
  const navigateToTaskInput = useNavigationStore((s) => s.navigateToTaskInput);
  const queryClient = useQueryClient();

  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
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

  const invalidateArchiveQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["archivedTaskIds"] });
    queryClient.invalidateQueries({ queryKey: [["archive"]] });
    queryClient.invalidateQueries({ queryKey: ["tasks"] });
  };

  const handleUnarchive = async (taskId: string) => {
    if (unarchivingId) return;
    setUnarchivingId(taskId);
    try {
      await trpcVanilla.archive.unarchive.mutate({ taskId });
      invalidateArchiveQueries();
      toast.success("Task restored");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(BRANCH_NOT_FOUND_PATTERN);
      if (match) {
        setBranchNotFound({ taskId, branchName: match[1] });
      } else {
        toast.error(`Failed to restore task: ${message}`);
      }
    } finally {
      setUnarchivingId(null);
    }
  };

  const executeDelete = async (taskId: string) => {
    if (unarchivingId) return;
    setUnarchivingId(taskId);
    try {
      await trpcVanilla.archive.delete.mutate({ taskId });
      invalidateArchiveQueries();
      toast.success("Task deleted");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to delete task: ${message}`);
    } finally {
      setUnarchivingId(null);
    }
  };

  const handleDelete = async (taskId: string, taskTitle: string) => {
    if (unarchivingId) return;

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
    setBranchNotFound(null);
    setUnarchivingId(taskId);
    try {
      await trpcVanilla.archive.unarchive.mutate({
        taskId,
        recreateBranch: true,
      });
      invalidateArchiveQueries();
      toast.success("Task restored");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to restore task: ${message}`);
    } finally {
      setUnarchivingId(null);
    }
  };

  return (
    <ArchivedTasksViewPresentation
      items={items}
      isLoading={isLoading}
      unarchivingId={unarchivingId}
      branchNotFound={branchNotFound}
      onBack={() => navigateToTaskInput()}
      onUnarchive={handleUnarchive}
      onDelete={handleDelete}
      onContextMenu={handleContextMenu}
      onBranchNotFoundClose={() => setBranchNotFound(null)}
      onRecreateBranch={handleRecreateBranch}
    />
  );
}
