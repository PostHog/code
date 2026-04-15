import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import {
  CaretUpIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Flex, Spinner, Text, Tooltip } from "@radix-ui/themes";
import type { SignalReportStatus, SignalReportTask, Task } from "@shared/types";
import { useState } from "react";

const RELATIONSHIP_LABELS: Record<SignalReportTask["relationship"], string> = {
  repo_selection: "Repository selection",
  research: "Research task",
  implementation: "Implementation task",
};

interface ReportTaskData {
  task: Task;
  relationship: SignalReportTask["relationship"];
}

function useReportTask(reportId: string, reportStatus: SignalReportStatus) {
  const isActive =
    reportStatus === "candidate" ||
    reportStatus === "in_progress" ||
    reportStatus === "pending_input";

  return useAuthenticatedQuery<ReportTaskData | null>(
    ["inbox", "report-task", reportId],
    async (client) => {
      const reportTasks = await client.getSignalReportTasks(reportId, {
        relationship: "research",
      });
      const match = reportTasks[0];
      if (!match) return null;
      const task = await client.getTask(match.task_id);
      return { task, relationship: match.relationship };
    },
    {
      enabled: !!reportId,
      staleTime: isActive ? 5_000 : 10_000,
      refetchInterval: isActive ? 5_000 : false,
    },
  );
}

function getTaskStatusSummary(task: Task): {
  label: string;
  color: string;
  icon: React.ReactNode;
} {
  const status = task.latest_run?.status;
  switch (status) {
    case "queued":
    case "in_progress":
      return {
        label: task.latest_run?.stage
          ? `Running — ${task.latest_run.stage}`
          : "Running…",
        color: "var(--amber-9)",
        icon: <CircleNotchIcon size={14} className="animate-spin" />,
      };
    case "completed":
      return {
        label: "Completed",
        color: "var(--green-9)",
        icon: <CheckCircleIcon size={14} weight="fill" />,
      };
    case "failed":
      return {
        label: "Failed",
        color: "var(--red-9)",
        icon: <XCircleIcon size={14} weight="fill" />,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        color: "var(--gray-9)",
        icon: <XCircleIcon size={14} />,
      };
    default:
      return {
        label: "Queued",
        color: "var(--gray-9)",
        icon: <Spinner size="1" />,
      };
  }
}

const BAR_HEIGHT = 38;

interface ReportTaskLogsProps {
  reportId: string;
  reportStatus: SignalReportStatus;
}

export function ReportTaskLogs({
  reportId,
  reportStatus,
}: ReportTaskLogsProps) {
  const { data, isLoading } = useReportTask(reportId, reportStatus);
  const [expanded, setExpanded] = useState(false);

  const task = data?.task ?? null;
  const relationship = data?.relationship ?? null;

  const showBar =
    isLoading ||
    !!task ||
    reportStatus === "candidate" ||
    reportStatus === "in_progress" ||
    reportStatus === "ready";

  if (!showBar) {
    return null;
  }

  const hasTask = !isLoading && !!task;

  // No task yet — show pipeline status with tooltip explaining what's happening
  if (!hasTask) {
    let statusText: string;
    let tooltipText: string;
    if (isLoading) {
      statusText = "Loading task…";
      tooltipText = "Checking if a research task exists for this report.";
    } else if (reportStatus === "candidate") {
      statusText = "Queued for research";
      tooltipText =
        "This report has been queued. A repository will be selected and then an AI agent will research it.";
    } else if (reportStatus === "in_progress") {
      statusText = "Research is starting…";
      tooltipText =
        "An AI research agent is being set up. Logs will appear here once the agent starts running.";
    } else {
      statusText = "Waiting for research task";
      tooltipText =
        "No research task has been created yet. One will appear when the report is picked up for investigation.";
    }

    return (
      <Flex
        align="center"
        gap="2"
        px="3"
        py="2"
        className="shrink-0 border-gray-5 border-t"
        style={{ height: BAR_HEIGHT }}
      >
        <Tooltip content={tooltipText}>
          <Flex align="center" gap="2" className="cursor-help">
            <Spinner size="1" />
            <Text size="1" color="gray" className="text-[12px]">
              {statusText}
            </Text>
          </Flex>
        </Tooltip>
      </Flex>
    );
  }

  const status = getTaskStatusSummary(task);

  return (
    <>
      {/* In-flow spacer — same height as the bar */}
      <div
        className="shrink-0 border-gray-5 border-t"
        style={{ height: BAR_HEIGHT }}
      />

      {/* Scrim — biome-ignore: scrim is a non-semantic dismissal target */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: scrim dismiss */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss */}
      <div
        onClick={expanded ? () => setExpanded(false) : undefined}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 10,
          background: "rgba(0, 0, 0, 0.32)",
          opacity: expanded ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: expanded ? "auto" : "none",
        }}
      />

      {/* Sliding card — animates `top` to avoid a Chromium layout
          bug with `transform` on absolute elements in flex+scroll. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 11,
          display: "flex",
          flexDirection: "column",
          borderTop: "1px solid var(--gray-6)",
          background: "var(--color-background)",
          pointerEvents: "none",
          top: expanded ? "15%" : `calc(100% - ${BAR_HEIGHT}px)`,
          transition: "top 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{ pointerEvents: "auto" }}
          className="flex w-full shrink-0 cursor-pointer items-center gap-2 border-gray-5 border-b bg-transparent px-3 py-2 text-left transition-colors hover:bg-gray-2"
        >
          <span style={{ color: status.color }}>{status.icon}</span>
          <Text size="1" weight="medium" className="flex-1 text-[12px]">
            {relationship ? RELATIONSHIP_LABELS[relationship] : "Research task"}
          </Text>
          <Text
            size="1"
            className="text-[11px]"
            style={{ color: status.color }}
          >
            {status.label}
          </Text>
          <span
            className="inline-flex text-gray-9"
            style={{
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            <CaretUpIcon size={12} />
          </span>
        </button>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: "hidden",
            pointerEvents: expanded ? "auto" : "none",
          }}
        >
          <TaskLogsPanel
            taskId={task.id}
            task={task}
            hideInput={reportStatus !== "ready"}
          />
        </div>
      </div>
    </>
  );
}
