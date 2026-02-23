import {
  Check,
  Cloud,
  SignOut,
  Spinner,
  Warning,
  XCircle,
} from "@phosphor-icons/react";
import {
  DotsCircleSpinner,
  formatRelativeTime,
  type TaskRunStatus,
} from "@posthog/ui";
import { Box, Button, Flex, Heading, Text } from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import type { Task } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";
import { useTaskStore } from "@/stores/taskStore";

function CloudStatusIcon({ status }: { status?: TaskRunStatus }) {
  if (status === "started" || status === "in_progress") {
    return (
      <span className="relative flex items-center justify-center">
        <Cloud size={14} className="text-accent-11" />
        <DotsCircleSpinner
          size={8}
          className="-right-0.5 -bottom-0.5 absolute text-accent-11"
        />
      </span>
    );
  }
  if (status === "completed") {
    return <Check size={14} weight="bold" className="text-green-11" />;
  }
  if (status === "failed") {
    return <Warning size={14} weight="fill" className="text-red-11" />;
  }
  if (status === "cancelled") {
    return <XCircle size={14} weight="fill" className="text-gray-10" />;
  }
  return <Cloud size={14} className="text-gray-10" />;
}

function TaskItem({
  task,
  isActive,
  onClick,
}: {
  task: Task;
  isActive: boolean;
  onClick: () => void;
}) {
  const updatedAt = new Date(task.updated_at).getTime();
  const status = task.latest_run?.status;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[12px] transition-colors ${
        isActive
          ? "bg-accent-4 text-gray-12"
          : "text-gray-11 hover:bg-gray-3 hover:text-gray-12"
      }`}
    >
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: 18, height: 18 }}
      >
        <CloudStatusIcon status={status} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {task.title || task.description}
      </span>
      <span className="shrink-0 text-[10px] text-gray-10">
        {formatRelativeTime(updatedAt)}
      </span>
    </button>
  );
}

export function Sidebar() {
  const client = useAuthStore((s) => s.client);
  const logout = useAuthStore((s) => s.logout);
  const { selectedTaskId, setSelectedTaskId } = useTaskStore();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => client?.getTasks(),
    enabled: !!client,
    refetchInterval: 15_000,
  });

  const cloudTasks = tasks
    .filter((t) => t.latest_run?.environment === "cloud")
    .sort(
      (a, b) =>
        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
    );

  return (
    <Flex
      direction="column"
      className="h-full border-gray-4 border-r"
      style={{ width: 280, backgroundColor: "var(--gray-2)" }}
    >
      <Flex
        align="center"
        justify="between"
        className="border-gray-4 border-b px-3 py-3"
      >
        <Heading size="3" weight="bold">
          Cloud Agents
        </Heading>
        <Button size="1" variant="ghost" color="gray" onClick={logout}>
          <SignOut size={14} />
        </Button>
      </Flex>

      <Box className="flex-1 overflow-y-auto px-2 py-2">
        {isLoading ? (
          <Flex align="center" justify="center" py="6">
            <Spinner size={20} className="animate-spin text-gray-9" />
          </Flex>
        ) : cloudTasks.length === 0 ? (
          <Flex align="center" justify="center" py="6">
            <Text size="1" color="gray">
              No cloud agents found
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="0">
            {cloudTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                isActive={selectedTaskId === task.id}
                onClick={() => setSelectedTaskId(task.id)}
              />
            ))}
          </Flex>
        )}
      </Box>

      <Box className="border-gray-4 border-t px-3 py-2">
        <Text size="1" color="gray">
          {cloudTasks.length} cloud{" "}
          {cloudTasks.length === 1 ? "agent" : "agents"}
        </Text>
      </Box>
    </Flex>
  );
}
