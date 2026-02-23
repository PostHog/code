import { Cloud, Spinner } from "@phosphor-icons/react";
import {
  type AcpMessage,
  storedLogEntriesToAcpMessages,
  type TaskRunStatus,
} from "@posthog/ui";
import { Flex, Heading, Text } from "@radix-ui/themes";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/stores/authStore";
import { ConversationView } from "./ConversationView";
import { MessageInput } from "./MessageInput";
import { StatusBar } from "./StatusBar";

interface AgentDetailProps {
  taskId: string;
}

const TERMINAL_STATUSES: Set<TaskRunStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

const POLL_ACTIVE_MS = 3000;
const POLL_IDLE_MS = 15000;

export function AgentDetail({ taskId }: AgentDetailProps) {
  const client = useAuthStore((s) => s.client);
  const [events, setEvents] = useState<AcpMessage[]>([]);
  const cursorRef = useRef<string | undefined>(undefined);
  const logUrlRef = useRef<string | undefined>(undefined);

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
  const status = run?.status;
  const running = !!status && !TERMINAL_STATUSES.has(status);

  useEffect(() => {
    logUrlRef.current = run?.log_url;
  }, [run?.log_url]);

  const fetchLogs = useCallback(async () => {
    if (!client || !runId) return;
    try {
      const entries = await client.getTaskRunSessionLogs(taskId, runId, {
        after: cursorRef.current,
        limit: 5000,
      });
      if (entries.length > 0) {
        const lastEntry = entries[entries.length - 1];
        if (lastEntry.timestamp) cursorRef.current = lastEntry.timestamp;
        setEvents((prev) => [
          ...prev,
          ...storedLogEntriesToAcpMessages(entries),
        ]);
        return;
      }
      if (!cursorRef.current && logUrlRef.current) {
        const response = await fetch(logUrlRef.current);
        if (!response.ok) return;
        const content = await response.text();
        if (!content.trim()) return;
        const logEntries = content
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
        if (logEntries.length > 0) {
          const lastEntry = logEntries[logEntries.length - 1];
          if (lastEntry.timestamp) cursorRef.current = lastEntry.timestamp;
          setEvents((prev) => [
            ...prev,
            ...storedLogEntriesToAcpMessages(logEntries),
          ]);
        }
      }
    } catch {
      /* retry on next poll */
    }
  }, [client, taskId, runId]);

  useEffect(() => {
    if (!runId) return;
    void fetchLogs();
  }, [runId, fetchLogs]);

  useEffect(() => {
    if (!runId) return;
    const interval = running ? POLL_ACTIVE_MS : POLL_IDLE_MS;
    const timer = setInterval(() => void fetchLogs(), interval);
    return () => clearInterval(timer);
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

  const prUrl = run?.output?.pr_url as string | undefined;

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

      <StatusBar
        status={status}
        stage={run?.stage}
        errorMessage={run?.error_message}
        branch={run?.branch}
        prUrl={prUrl}
        onCancel={handleCancel}
      />

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
