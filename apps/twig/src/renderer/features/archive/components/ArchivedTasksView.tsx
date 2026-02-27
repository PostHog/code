import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Box, Button, Dialog, Flex, Text } from "@radix-ui/themes";
import { trpcReact, trpcVanilla } from "@renderer/trpc";
import type { ArchivedTask } from "@shared/types/archive";
import { useNavigationStore } from "@stores/navigationStore";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@utils/toast";
import { useState } from "react";

const BRANCH_NOT_FOUND_PATTERN = /Branch '(.+)' does not exist/;

function formatArchivedDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface ArchivedTaskRowProps {
  task: ArchivedTask;
  onUnarchive: () => void;
  isUnarchiving: boolean;
}

function ArchivedTaskRow({
  task,
  onUnarchive,
  isUnarchiving,
}: ArchivedTaskRowProps) {
  const repoName = task.repository?.split("/").pop() ?? null;

  return (
    <Flex
      align="center"
      justify="between"
      px="3"
      py="2"
      className="rounded-md hover:bg-gray-2"
    >
      <Flex direction="column" gap="1" className="min-w-0 flex-1">
        <Text
          size="2"
          weight="medium"
          className="truncate font-mono text-[12px]"
        >
          {task.title}
        </Text>
        <Flex align="center" gap="1">
          <Text className="font-mono text-[11px] text-gray-10">
            {formatArchivedDate(task.archivedAt)}
          </Text>
          {repoName && (
            <>
              <Text className="font-mono text-[11px] text-gray-8">·</Text>
              <Text className="truncate font-mono text-[11px] text-gray-10">
                {repoName}
              </Text>
            </>
          )}
        </Flex>
      </Flex>
      <Button
        variant="soft"
        size="1"
        className="ml-3 shrink-0"
        onClick={onUnarchive}
        disabled={isUnarchiving}
      >
        Unarchive
      </Button>
    </Flex>
  );
}

interface BranchNotFoundPrompt {
  taskId: string;
  branchName: string;
}

export function ArchivedTasksView() {
  const { data: archivedTasks = [], isLoading } =
    trpcReact.archive.list.useQuery();
  const navigateToTaskInput = useNavigationStore((s) => s.navigateToTaskInput);
  const queryClient = useQueryClient();

  const [unarchivingId, setUnarchivingId] = useState<string | null>(null);
  const [branchNotFound, setBranchNotFound] =
    useState<BranchNotFoundPrompt | null>(null);

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
      toast.success("Task unarchived");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(BRANCH_NOT_FOUND_PATTERN);
      if (match) {
        setBranchNotFound({ taskId, branchName: match[1] });
      } else {
        toast.error(`Failed to unarchive task: ${message}`);
      }
    } finally {
      setUnarchivingId(null);
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
      toast.success("Task unarchived");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to unarchive task: ${message}`);
    } finally {
      setUnarchivingId(null);
    }
  };

  return (
    <Flex direction="column" height="100%">
      <Box className="border-gray-5 border-b bg-gray-1" px="3" py="2">
        <Flex align="center" gap="2">
          <button
            type="button"
            onClick={() => navigateToTaskInput()}
            className="flex items-center justify-center rounded p-1 text-gray-11 hover:bg-gray-3"
          >
            <ArrowLeftIcon size={14} />
          </button>
          <Text size="1" weight="medium" className="font-mono text-[12px]">
            Archived Tasks
          </Text>
        </Flex>
      </Box>

      <Box className="flex-1 overflow-y-auto" p="2">
        {isLoading ? (
          <Flex align="center" justify="center" py="8">
            <Text className="font-mono text-[12px] text-gray-10">
              Loading...
            </Text>
          </Flex>
        ) : archivedTasks.length === 0 ? (
          <Flex align="center" justify="center" py="8">
            <Text className="font-mono text-[12px] text-gray-10">
              No archived tasks
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="1">
            {archivedTasks.map((task) => (
              <ArchivedTaskRow
                key={task.taskId}
                task={task}
                onUnarchive={() => handleUnarchive(task.taskId)}
                isUnarchiving={unarchivingId === task.taskId}
              />
            ))}
          </Flex>
        )}
      </Box>

      <Dialog.Root
        open={branchNotFound !== null}
        onOpenChange={(open) => {
          if (!open) setBranchNotFound(null);
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
            <Button size="1" onClick={handleRecreateBranch}>
              Restore to new branch
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}
