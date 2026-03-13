import { Popover } from "@radix-ui/themes";
import { type ReactNode, useCallback } from "react";
import { useAvailableTasks } from "../hooks/useAvailableTasks";
import { useCommandCenterStore } from "../stores/commandCenterStore";

interface TaskSelectorProps {
  cellIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function TaskSelector({
  cellIndex,
  open,
  onOpenChange,
  children,
}: TaskSelectorProps) {
  const availableTasks = useAvailableTasks();
  const assignTask = useCommandCenterStore((s) => s.assignTask);

  const handleSelect = useCallback(
    (taskId: string) => {
      assignTask(cellIndex, taskId);
      onOpenChange(false);
    },
    [assignTask, cellIndex, onOpenChange],
  );

  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger>{children}</Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="center"
        sideOffset={4}
        style={{ padding: 4, minWidth: 240, maxHeight: 300 }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: 280 }}>
          {availableTasks.length === 0 ? (
            <div className="px-2 py-3 text-center font-mono text-[11px] text-gray-10">
              No available tasks
            </div>
          ) : (
            availableTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => handleSelect(task.id)}
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-left font-mono text-[11px] text-gray-12 transition-colors hover:bg-gray-3"
              >
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
              </button>
            ))
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}
