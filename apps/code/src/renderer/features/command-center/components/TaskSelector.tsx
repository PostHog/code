import { Combobox } from "@components/ui/combobox/Combobox";
import { Plus } from "@phosphor-icons/react";
import { Popover } from "@radix-ui/themes";
import { useNavigationStore } from "@stores/navigationStore";
import { type ReactNode, useCallback } from "react";
import { useAvailableTasks } from "../hooks/useAvailableTasks";
import { useCommandCenterStore } from "../stores/commandCenterStore";

interface TaskSelectorProps {
  cellIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewTask?: () => void;
  children: ReactNode;
}

export function TaskSelector({
  cellIndex,
  open,
  onOpenChange,
  onNewTask,
  children,
}: TaskSelectorProps) {
  const availableTasks = useAvailableTasks();
  const assignTask = useCommandCenterStore((s) => s.assignTask);
  const navigateToTaskInput = useNavigationStore((s) => s.navigateToTaskInput);

  const handleSelect = useCallback(
    (taskId: string) => {
      assignTask(cellIndex, taskId);
      onOpenChange(false);
    },
    [assignTask, cellIndex, onOpenChange],
  );

  const handleNewTask = useCallback(() => {
    onOpenChange(false);
    if (onNewTask) {
      onNewTask();
    } else {
      navigateToTaskInput();
    }
  }, [onOpenChange, onNewTask, navigateToTaskInput]);

  return (
    <Combobox.Root
      open={open}
      onOpenChange={onOpenChange}
      value=""
      onValueChange={handleSelect}
      size="1"
    >
      <Popover.Trigger>{children}</Popover.Trigger>
      <Combobox.Content
        items={availableTasks}
        getValue={(task) => task.title}
        side="bottom"
        align="center"
        sideOffset={4}
        style={{ minWidth: 240 }}
      >
        {({ filtered, hasMore, moreCount }) => (
          <>
            <Combobox.Input placeholder="Search tasks..." />
            <Combobox.Empty>No matching tasks</Combobox.Empty>
            {filtered.map((task) => (
              <Combobox.Item
                key={task.id}
                value={task.id}
                textValue={task.title}
              >
                {task.title}
              </Combobox.Item>
            ))}
            {hasMore && (
              <div className="combobox-label">
                {moreCount} more {moreCount === 1 ? "task" : "tasks"}; type to
                filter
              </div>
            )}
            <Combobox.Footer>
              <button
                type="button"
                className="combobox-footer-button"
                onClick={handleNewTask}
              >
                <Plus size={11} weight="bold" />
                New task
              </button>
            </Combobox.Footer>
          </>
        )}
      </Combobox.Content>
    </Combobox.Root>
  );
}
