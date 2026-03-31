import { TaskInput } from "@features/task-detail/components/TaskInput";
import { ArrowsOut, Plus, X } from "@phosphor-icons/react";
import { Flex, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useState } from "react";
import type { CommandCenterCellData } from "../hooks/useCommandCenterData";
import { useCommandCenterStore } from "../stores/commandCenterStore";
import { CommandCenterSessionView } from "./CommandCenterSessionView";
import { StatusBadge } from "./StatusBadge";
import { TaskSelector } from "./TaskSelector";

interface CommandCenterPanelProps {
  cell: CommandCenterCellData;
  isActiveSession: boolean;
}

function EmptyCell({ cellIndex }: { cellIndex: number }) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const assignTask = useCommandCenterStore((s) => s.assignTask);

  const handleTaskCreated = useCallback(
    (task: Task) => {
      assignTask(cellIndex, task.id);
    },
    [assignTask, cellIndex],
  );

  if (isCreating) {
    return (
      <Flex direction="column" height="100%">
        <Flex
          align="center"
          justify="between"
          px="2"
          py="1"
          className="shrink-0 border-gray-6 border-b"
        >
          <Text
            size="1"
            weight="medium"
            className="font-mono text-[11px] text-gray-11"
          >
            New task
          </Text>
          <button
            type="button"
            onClick={() => setIsCreating(false)}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </Flex>
        <Flex direction="column" className="min-h-0 flex-1">
          <TaskInput onTaskCreated={handleTaskCreated} />
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex align="center" justify="center" height="100%">
      <Flex direction="column" align="center" gap="2">
        <TaskSelector
          cellIndex={cellIndex}
          open={selectorOpen}
          onOpenChange={setSelectorOpen}
          onNewTask={() => setIsCreating(true)}
        >
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-gray-7 border-dashed px-3 py-1.5 text-[12px] text-gray-10 transition-colors hover:border-gray-9 hover:text-gray-12"
          >
            <Plus size={12} />
            Add task
          </button>
        </TaskSelector>
        <Text size="1" className="text-[11px] text-gray-9">
          or drag a task from the sidebar
        </Text>
      </Flex>
    </Flex>
  );
}

function PopulatedCell({
  cell,
  isActiveSession,
}: {
  cell: CommandCenterCellData & { task: Task };
  isActiveSession: boolean;
}) {
  const navigateToTask = useNavigationStore((s) => s.navigateToTask);
  const removeTask = useCommandCenterStore((s) => s.removeTask);

  const handleExpand = useCallback(() => {
    navigateToTask(cell.task);
  }, [navigateToTask, cell.task]);

  const handleRemove = useCallback(() => {
    removeTask(cell.cellIndex);
  }, [removeTask, cell.cellIndex]);

  return (
    <Flex direction="column" height="100%">
      <Flex
        align="center"
        gap="2"
        px="2"
        py="1"
        className="shrink-0 border-gray-6 border-b"
      >
        <Text
          size="1"
          weight="medium"
          className="min-w-0 flex-1 truncate text-[12px]"
          title={cell.task.title}
        >
          {cell.task.title}
        </Text>
        <Flex align="center" gap="1" className="shrink-0">
          <StatusBadge status={cell.status} />
          {cell.repoName && (
            <span className="rounded bg-gray-3 px-1 py-0.5 text-[9px] text-gray-10">
              {cell.repoName}
            </span>
          )}
          <button
            type="button"
            onClick={handleExpand}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            title="Open task"
          >
            <ArrowsOut size={12} />
          </button>
          <button
            type="button"
            onClick={handleRemove}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            title="Remove from grid"
          >
            <X size={12} />
          </button>
        </Flex>
      </Flex>

      <Flex direction="column" className="min-h-0 flex-1">
        <CommandCenterSessionView
          taskId={cell.task.id}
          task={cell.task}
          isActiveSession={isActiveSession}
        />
      </Flex>
    </Flex>
  );
}

export function CommandCenterPanel({
  cell,
  isActiveSession,
}: CommandCenterPanelProps) {
  if (!cell.taskId || !cell.task) {
    return <EmptyCell cellIndex={cell.cellIndex} />;
  }

  return (
    <PopulatedCell
      cell={cell as CommandCenterCellData & { task: Task }}
      isActiveSession={isActiveSession}
    />
  );
}
