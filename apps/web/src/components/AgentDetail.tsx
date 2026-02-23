import {
  ArrowSquareOut,
  Cloud,
  GitBranch,
  Spinner,
  XCircle,
} from "@phosphor-icons/react";
import {
  type AcpMessage,
  DotsCircleSpinner,
  storedLogEntriesToAcpMessages,
} from "@posthog/ui";
import { Button, Flex, Heading, Text } from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskRun } from "@/api/client";
import { useAuthStore } from "@/stores/authStore";
import { ConversationView } from "./ConversationView";
import { MessageInput } from "./MessageInput";

interface AgentDetailProps {
  taskId: string;
}

function isTerminal(status?: string) {
  return (
    status === "completed" || status === "failed" || status === "cancelled"
  );
}

function StatusBar({
  run,
  onCancel,
}: {
  run?: TaskRun | null;
  onCancel: () => void;
}) {
  const status = run?.status;
  const prUrl = run?.output?.pr_url as string | undefined;
  const stage = run?.stage;
  const errorMessage = run?.error_message;
  const branch = run?.branch;
  const isRunning = status === "started" || status === "in_progress";

  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      className="border-gray-4 border-t px-4 py-2"
      style={{ backgroundColor: "var(--gray-2)" }}
    >
      <Flex align="center" gap="2" className="min-w-0 flex-1">
        {isRunning ? (
          <>
            <DotsCircleSpinner size={14} className="text-accent-11" />
            <Text size="2" color="gray" className="truncate">
              Running{stage ? ` — ${stage}` : ""}...
            </Text>
          </>
        ) : status === "completed" ? (
          <>
            <Cloud size={14} weight="fill" className="text-green-11" />
            <Text size="2" className="text-green-11">
              Completed
            </Text>
          </>
        ) : status === "failed" ? (
          <>
            <XCircle size={14} weight="fill" className="text-red-11" />
            <Text size="2" color="red" className="truncate">
              Failed{errorMessage ? `: ${errorMessage}` : ""}
            </Text>
          </>
        ) : status === "cancelled" ? (
          <>
            <XCircle size={14} weight="fill" className="text-gray-10" />
            <Text size="2" color="gray">
              Cancelled
            </Text>
          </>
        ) : null}

        {branch && (
          <Flex align="center" gap="1" className="text-gray-10">
            <GitBranch size={12} />
            <Text size="1" className="font-mono">
              {branch}
            </Text>
          </Flex>
        )}
      </Flex>

      <Flex align="center" gap="2">
        {isRunning && (
          <Button size="1" variant="soft" color="red" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {prUrl && (
          <Button size="1" variant="soft" asChild>
            <a href={prUrl} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut size={14} />
              View PR
            </a>
          </Button>
        )}
      </Flex>
    </Flex>
  );
}

export function AgentDetail({ taskId }: AgentDetailProps) {
  const client = useAuthStore((s) => s.client);
  const [events, setEvents] = useState<AcpMessage[]>([]);
  const cursorRef = useRef<string | undefined>(undefined);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    data: task,
    isLoading: taskLoading,
    refetch: refetchTask,
  } = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => client?.getTask(taskId),
    enabled: !!client,
    refetchInterval: 10_000,
  });

  const run = task?.latest_run;
  const runId = run?.id;
  const running = !isTerminal(run?.status);

  useEffect(() => {
    setEvents([]);
    cursorRef.current = undefined;
  }, []);

  const fetchLogs = useCallback(async () => {
    if (!client || !runId) return;
    try {
      const entries = await client.getTaskRunSessionLogs(taskId, runId, {
        after: cursorRef.current,
        limit: 5000,
      });
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry.timestamp) {
          cursorRef.current = lastEntry.timestamp;
        }
        const newMessages = storedLogEntriesToAcpMessages(entries);
        setEvents((prev) => [...prev, ...newMessages]);
      } else if (!cursorRef.current && task) {
        const logEntries = await client.getTaskLogs(task);
        if (logEntries.length > 0) {
          const lastEntry = logEntries[logEntries.length - 1];
          if (lastEntry.timestamp) cursorRef.current = lastEntry.timestamp;
          const newMessages = storedLogEntriesToAcpMessages(logEntries);
          setEvents((prev) => [...prev, ...newMessages]);
        }
      }
    } catch {
      /* retry on next poll */
    }
  }, [client, taskId, runId, task]);

  useEffect(() => {
    if (!runId) return;
    void fetchLogs();
  }, [runId, fetchLogs]);

  useEffect(() => {
    if (!runId) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    const interval = running ? 3000 : 15000;
    pollTimerRef.current = setInterval(() => void fetchLogs(), interval);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [runId, running, fetchLogs]);

  const handleCancel = useCallback(async () => {
    if (!client || !runId) return;
    try {
      await client.cancelTaskRun(taskId, runId);
      void refetchTask();
    } catch {
      /* ignore */
    }
  }, [client, taskId, runId, refetchTask]);

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!client || !runId) return;
      try {
        await client.sendMessage(taskId, runId, message);
      } catch {
        /* ignore */
      }
    },
    [client, taskId, runId],
  );

  if (taskLoading || !task) {
    return (
      <Flex align="center" justify="center" className="h-full bg-gray-1">
        <Spinner size={32} className="animate-spin text-gray-9" />
      </Flex>
    );
  }

  return (
    <Flex direction="column" className="h-full">
      <Flex
        align="center"
        gap="3"
        className="border-gray-4 border-b px-4 py-3"
        style={{ backgroundColor: "var(--gray-2)" }}
      >
        <Cloud size={16} className="text-accent-11" />
        <Flex direction="column" gap="0" className="min-w-0 flex-1">
          <Heading size="2" weight="medium" className="truncate">
            {task.title || task.description}
          </Heading>
          {task.repository && (
            <Text size="1" color="gray" className="font-mono">
              {task.repository}
            </Text>
          )}
        </Flex>
      </Flex>

      <ConversationView events={events} isPromptPending={running} />

      <StatusBar run={run} onCancel={handleCancel} />

      {running && (
        <MessageInput
          onSend={handleSendMessage}
          onCancel={handleCancel}
          isLoading={running}
          placeholder="Send a follow-up message..."
        />
      )}
    </Flex>
  );
}
