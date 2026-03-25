import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import {
  ArrowsOut,
  CheckCircle,
  Plus,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Badge, Flex, ScrollArea, Text } from "@radix-ui/themes";
import type { Task } from "@shared/types";
import type { AutomationRunInfo } from "@shared/types/automations";
import {
  type AcpMessage,
  isJsonRpcNotification,
} from "@shared/types/session-events";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useState } from "react";
import type { CommandCenterCellData } from "../hooks/useCommandCenterData";
import { useSummary } from "../hooks/useSummary";
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

  return (
    <Flex align="center" justify="center" height="100%">
      <Flex direction="column" align="center" gap="2">
        <TaskSelector
          cellIndex={cellIndex}
          open={selectorOpen}
          onOpenChange={setSelectorOpen}
        >
          <button
            type="button"
            onClick={() => setSelectorOpen(true)}
            className="flex items-center gap-1.5 rounded-md border border-gray-7 border-dashed px-3 py-1.5 font-mono text-[11px] text-gray-10 transition-colors hover:border-gray-9 hover:text-gray-12"
          >
            <Plus size={12} />
            Add task
          </button>
        </TaskSelector>
        <Text size="1" className="font-mono text-[10px] text-gray-9">
          or drag a task from the sidebar
        </Text>
      </Flex>
    </Flex>
  );
}

/**
 * Extract all assistant text from ACP session events.
 * Uses the exact same parsing path as buildConversationItems.ts:
 * isJsonRpcNotification → method === "session/update" → params.update.sessionUpdate
 */
function extractAssistantText(events: AcpMessage[]): string {
  const chunks: string[] = [];
  for (const evt of events) {
    const msg = evt.message;
    if (!isJsonRpcNotification(msg)) continue;
    if (msg.method !== "session/update") continue;
    const params = msg.params as
      | {
          update?: {
            sessionUpdate?: string;
            content?: { type: string; text?: string };
          };
        }
      | undefined;
    const sessionUpdate = params?.update?.sessionUpdate;
    // Handle both streaming chunks and complete messages
    if (
      (sessionUpdate === "agent_message_chunk" ||
        sessionUpdate === "agent_message") &&
      params?.update?.content?.type === "text" &&
      params.update.content.text
    ) {
      chunks.push(params.update.content.text);
    }
  }
  return chunks.join("");
}

function TaskSummaryCard({
  session,
}: {
  task: Task;
  session?: { events: AcpMessage[] };
}) {
  // Extract actual agent output from session events
  const agentOutput = session?.events?.length
    ? extractAssistantText(session.events)
    : "";
  const textToSummarize = agentOutput || null;
  const { summary, loading } = useSummary(textToSummarize);

  return (
    <ScrollArea type="auto" style={{ flex: 1 }}>
      <div className="p-3 text-[13px] text-gray-12 leading-relaxed">
        {loading ? (
          <Text size="2" className="text-gray-10">
            Generating summary...
          </Text>
        ) : summary ? (
          <MarkdownRenderer content={summary} />
        ) : (
          <Text size="2" className="text-gray-10">
            Waiting for agent output...
          </Text>
        )}
      </div>
    </ScrollArea>
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
  const summarize = useCommandCenterStore((s) => s.summarize);

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
          className="min-w-0 flex-1 truncate font-mono text-[11px]"
          title={cell.task.title}
        >
          {cell.task.title}
        </Text>
        <Flex align="center" gap="1" className="shrink-0">
          <StatusBadge status={cell.status} />
          {cell.repoName && (
            <span className="rounded bg-gray-3 px-1 py-0.5 font-mono text-[9px] text-gray-10">
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

      <Flex direction="column" className="relative min-h-0 flex-1">
        {/* Always render the session view to keep the connection alive */}
        <div
          className={
            summarize ? "invisible h-0 overflow-hidden" : "flex h-full flex-col"
          }
        >
          <CommandCenterSessionView
            taskId={cell.task.id}
            task={cell.task}
            isActiveSession={isActiveSession}
          />
        </div>
        {summarize && (
          <TaskSummaryCard task={cell.task} session={cell.session} />
        )}
      </Flex>
    </Flex>
  );
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function AutomationCell({
  cell,
}: {
  cell: CommandCenterCellData & { automationRun: AutomationRunInfo };
}) {
  const removeTask = useCommandCenterStore((s) => s.removeTask);
  const summarize = useCommandCenterStore((s) => s.summarize);
  const [expanded, setExpanded] = useState(false);
  const run = cell.automationRun;
  const isSuccess = run.status === "success";
  const displayTime = run.completedAt ?? run.startedAt;

  // Use LLM summary when in summarize mode or collapsed
  const showSummary = summarize || !expanded;
  const { summary: llmSummary, loading: summaryLoading } = useSummary(
    showSummary ? run.output : null,
  );

  return (
    <Flex direction="column" height="100%">
      <Flex
        align="center"
        gap="2"
        px="2"
        py="1"
        className="shrink-0 border-gray-6 border-b"
      >
        {isSuccess ? (
          <CheckCircle
            size={12}
            weight="fill"
            className="shrink-0 text-green-9"
          />
        ) : (
          <Warning size={12} weight="fill" className="shrink-0 text-red-9" />
        )}
        <Text
          size="1"
          weight="medium"
          className="min-w-0 flex-1 truncate font-mono text-[11px]"
          title={cell.automationName}
        >
          {cell.automationName ?? "Automation"}
        </Text>
        <Flex align="center" gap="1" className="shrink-0">
          <Badge size="1" variant="soft" color={isSuccess ? "green" : "red"}>
            {isSuccess ? "Success" : "Failed"}
          </Badge>
          <span className="rounded bg-gray-3 px-1 py-0.5 font-mono text-[9px] text-gray-10">
            {timeAgo(displayTime)}
          </span>
          <button
            type="button"
            onClick={() => removeTask(cell.cellIndex)}
            className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
            title="Remove from grid"
          >
            <X size={12} />
          </button>
        </Flex>
      </Flex>

      <ScrollArea type="auto" style={{ flex: 1 }}>
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: click to expand */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: click to expand */}
        <div
          className="cursor-pointer p-3 text-[13px] text-gray-12 leading-relaxed"
          onClick={() => setExpanded((prev) => !prev)}
        >
          {isSuccess && run.output ? (
            showSummary ? (
              summaryLoading ? (
                <Text size="2" className="text-gray-10">
                  Generating summary...
                </Text>
              ) : (
                <MarkdownRenderer content={llmSummary ?? "Completed."} />
              )
            ) : (
              <MarkdownRenderer content={run.output} />
            )
          ) : run.error ? (
            <MarkdownRenderer content={run.error} />
          ) : (
            <Text size="2" className="text-gray-10">
              Running...
            </Text>
          )}
        </div>
      </ScrollArea>
    </Flex>
  );
}

export function CommandCenterPanel({
  cell,
  isActiveSession,
}: CommandCenterPanelProps) {
  // Automation run cell
  if (cell.automationRunId && cell.automationRun) {
    return (
      <AutomationCell
        cell={
          cell as CommandCenterCellData & {
            automationRun: AutomationRunInfo;
          }
        }
      />
    );
  }

  // Empty cell
  if (!cell.taskId || !cell.task) {
    return <EmptyCell cellIndex={cell.cellIndex} />;
  }

  // Task cell
  return (
    <PopulatedCell
      cell={cell as CommandCenterCellData & { task: Task }}
      isActiveSession={isActiveSession}
    />
  );
}
