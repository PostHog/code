import { ReportImplementationPrLink } from "@features/inbox/components/utils/ReportImplementationPrLink";
import { TaskLogsPanel } from "@features/task-detail/components/TaskLogsPanel";
import { useAuthenticatedQuery } from "@hooks/useAuthenticatedQuery";
import {
  CaretUpIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  Cloud,
  DotOutlineIcon,
  XCircleIcon,
} from "@phosphor-icons/react";
import { Button, Spinner, Text, Tooltip } from "@radix-ui/themes";
import type { SignalReportStatus, SignalReportTask, Task } from "@shared/types";
import { useState } from "react";

type Relationship = SignalReportTask["relationship"];
type BarRelationship = Extract<Relationship, "research" | "implementation">;

const RELATIONSHIP_LABELS: Record<BarRelationship, string> = {
  research: "Research task",
  implementation: "Implementation task",
};

// Bars are rendered top-to-bottom in this order.
const BAR_ORDER: BarRelationship[] = ["research", "implementation"];

const BAR_HEIGHT = 38;

interface ReportTaskData {
  task: Task;
  relationship: Relationship;
}

function useReportTasks(reportId: string, reportStatus: SignalReportStatus) {
  const isActive =
    reportStatus === "candidate" ||
    reportStatus === "in_progress" ||
    reportStatus === "pending_input";

  return useAuthenticatedQuery<ReportTaskData[]>(
    ["inbox", "report-tasks", reportId],
    async (client) => {
      const reportTasks = await client.getSignalReportTasks(reportId);
      const relevant = reportTasks.filter((rt): rt is SignalReportTask =>
        (BAR_ORDER as Relationship[]).includes(rt.relationship),
      );
      return Promise.all(
        relevant.map(async (rt) => {
          const task = (await client.getTask(rt.task_id)) as unknown as Task;
          return { task, relationship: rt.relationship };
        }),
      );
    },
    {
      enabled: !!reportId,
      staleTime: isActive ? 5_000 : 10_000,
      refetchInterval: isActive ? 5_000 : false,
    },
  );
}

interface BarSummary {
  label: string;
  color: string;
  icon: React.ReactNode;
}

function getTaskStatusSummary(task: Task): BarSummary {
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

function getResearchPendingSummary(
  reportStatus: SignalReportStatus,
  isLoading: boolean,
): { summary: BarSummary; tooltip: string } {
  if (isLoading) {
    return {
      summary: {
        label: "Loading…",
        color: "var(--gray-9)",
        icon: <Spinner size="1" />,
      },
      tooltip: "Checking if a research task exists for this report.",
    };
  }
  if (reportStatus === "candidate") {
    return {
      summary: {
        label: "Queued",
        color: "var(--gray-9)",
        icon: <Spinner size="1" />,
      },
      tooltip:
        "This report has been queued. A repository will be selected and then an AI agent will research it.",
    };
  }
  if (reportStatus === "in_progress") {
    return {
      summary: {
        label: "Starting…",
        color: "var(--amber-9)",
        icon: <CircleNotchIcon size={14} className="animate-spin" />,
      },
      tooltip:
        "An AI research agent is being set up. Logs will appear here once the agent starts running.",
    };
  }
  return {
    summary: {
      label: "Unavailable",
      color: "var(--gray-9)",
      icon: <XCircleIcon size={14} />,
    },
    tooltip:
      "No research task is recorded for this report. It may have been created before research tracking was in place.",
  };
}

export function getTaskPrUrl(task: Task): string | null {
  const output = task.latest_run?.output;
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const prUrl = (output as Record<string, unknown>).pr_url;
    if (typeof prUrl === "string" && prUrl.length > 0) {
      return prUrl;
    }
  }
  return null;
}

interface Bar {
  relationship: BarRelationship;
  task: Task | null;
  summary: BarSummary;
  /** Tooltip shown on hover (e.g. pipeline status explanation). */
  tooltip?: string;
  /** When set, render a run-action button with this label alongside (or instead of) the status label. */
  runActionLabel?: string;
  /** PR URL produced by the implementation task, if available. */
  prUrl?: string | null;
}

function buildBars({
  researchTask,
  implementationTask,
  reportStatus,
  isLoading,
  onRunInCloud,
}: {
  researchTask: Task | null;
  implementationTask: Task | null;
  reportStatus: SignalReportStatus;
  isLoading: boolean;
  onRunInCloud?: () => void;
}): Bar[] {
  const isPendingInput = reportStatus === "pending_input";
  const runActionLabel = onRunInCloud
    ? isPendingInput
      ? "Provide input for PR"
      : "Create PR"
    : undefined;

  const bars: Bar[] = [];
  for (const relationship of BAR_ORDER) {
    if (relationship === "research") {
      if (researchTask) {
        bars.push({
          relationship: "research",
          task: researchTask,
          summary: getTaskStatusSummary(researchTask),
        });
      } else {
        const { summary, tooltip } = getResearchPendingSummary(
          reportStatus,
          isLoading,
        );
        bars.push({ relationship: "research", task: null, summary, tooltip });
      }
    } else if (implementationTask) {
      bars.push({
        relationship: "implementation",
        task: implementationTask,
        summary: getTaskStatusSummary(implementationTask),
        prUrl: getTaskPrUrl(implementationTask),
        // Once the impl task exists, only surface the run button when the
        // agent is awaiting user input (the user has to provide context to
        // unstick the PR). Otherwise the bar is purely informational.
        runActionLabel: isPendingInput ? runActionLabel : undefined,
      });
    } else if (reportStatus === "ready" || isPendingInput) {
      bars.push({
        relationship: "implementation",
        task: null,
        summary: {
          label: "Not started",
          color: "var(--gray-9)",
          icon: <DotOutlineIcon size={14} />,
        },
        runActionLabel,
      });
    }
  }
  return bars;
}

interface BarRowProps {
  bar: Bar;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRunAction?: () => void;
}

function BarRow({
  bar,
  index,
  isExpanded,
  onToggle,
  onRunAction,
}: BarRowProps) {
  const { relationship, task, summary, tooltip, runActionLabel, prUrl } = bar;
  const isInteractive = !!task;
  const showRunAction = !!runActionLabel;
  const hideStatusLabel = showRunAction && !task;

  const className = [
    "flex w-full items-center gap-2 bg-transparent px-2 @md:px-3 @lg:px-4 @xl:px-5 @2xl:px-6 @3xl:px-8 @4xl:px-10 @5xl:px-12 py-2 text-left transition-colors",
    index > 0 ? "border-gray-5 border-t" : "",
    isInteractive
      ? "cursor-pointer hover:bg-gray-2"
      : showRunAction
        ? "cursor-default"
        : "cursor-default opacity-70",
    isExpanded && isInteractive ? "bg-gray-2" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span style={{ color: summary.color }}>{summary.icon}</span>
      <Text className="font-medium text-[12px]">
        {RELATIONSHIP_LABELS[relationship]}
      </Text>
      {hideStatusLabel ? (
        <span className="flex-1" />
      ) : (
        <Text className="flex-1 text-[11px]" style={{ color: summary.color }}>
          {prUrl
            ? summary.label
            : relationship === "implementation" &&
                (task?.latest_run?.status === "queued" ||
                  task?.latest_run?.status === "in_progress")
              ? "Working on a PR…"
              : summary.label}
        </Text>
      )}
      {prUrl && <ReportImplementationPrLink prUrl={prUrl} size="md" />}
      {showRunAction && (
        <Button
          size="1"
          variant="solid"
          className="gap-1 font-medium text-[11px]"
          onClick={(e) => {
            e.stopPropagation();
            onRunAction?.();
          }}
        >
          <Cloud size={12} />
          {runActionLabel}
        </Button>
      )}
      {isInteractive && (
        <span
          className="inline-flex text-gray-9"
          style={{
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <CaretUpIcon size={12} />
        </span>
      )}
    </>
  );

  // Render every interactive bar as a <div role="button"> rather than a
  // <button> so the implementation row can legally nest the run-action
  // <button> when present (HTML disallows nested buttons), and so the
  // click-to-toggle behavior stays uniform across all states. Non-interactive
  // bars (no task) render as a plain <div>.
  const row = isInteractive ? (
    // biome-ignore lint/a11y/useSemanticElements: see comment above
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
      className={className}
      style={{ height: BAR_HEIGHT }}
    >
      {inner}
    </div>
  ) : (
    <div className={className} style={{ height: BAR_HEIGHT }}>
      {inner}
    </div>
  );

  return tooltip ? <Tooltip content={tooltip}>{row}</Tooltip> : row;
}

interface ReportTaskLogsProps {
  reportId: string;
  reportStatus: SignalReportStatus;
  /** Open the cloud task confirmation flow. */
  onRunInCloud?: () => void;
}

export function ReportTaskLogs({
  reportId,
  reportStatus,
  onRunInCloud,
}: ReportTaskLogsProps) {
  const { data, isLoading } = useReportTasks(reportId, reportStatus);
  const [expanded, setExpanded] = useState<BarRelationship | null>(null);

  const tasks = data ?? [];
  const researchTask =
    tasks.find((t) => t.relationship === "research")?.task ?? null;
  const implementationTask =
    tasks.find((t) => t.relationship === "implementation")?.task ?? null;

  const bars = buildBars({
    researchTask,
    implementationTask,
    reportStatus,
    isLoading,
    onRunInCloud,
  });

  // Hide entirely when the report isn't actionable (e.g. POTENTIAL) and we
  // have no tasks to show.
  const showBar =
    isLoading ||
    tasks.length > 0 ||
    reportStatus === "candidate" ||
    reportStatus === "in_progress" ||
    reportStatus === "ready" ||
    reportStatus === "pending_input";

  if (!showBar) {
    return null;
  }

  const expandedBar = expanded
    ? (bars.find((b) => b.relationship === expanded && b.task) ?? null)
    : null;
  const isOpen = !!expandedBar;
  const totalBarsHeight = BAR_HEIGHT * bars.length;

  const collapse = () => setExpanded(null);
  const toggle = (relationship: BarRelationship) =>
    setExpanded((curr) => (curr === relationship ? null : relationship));

  return (
    <>
      {/* In-flow spacer — same height as the stacked bars. */}
      <div
        className="shrink-0 border-gray-5 border-t"
        style={{ height: totalBarsHeight }}
      />

      {/* Scrim — biome-ignore: scrim is a non-semantic dismissal target */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: scrim dismiss */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: scrim dismiss */}
      <div
        onClick={isOpen ? collapse : undefined}
        style={{
          background: "rgba(0, 0, 0, 0.32)",
          opacity: isOpen ? 1 : 0,
          transition: "opacity 0.2s ease",
          pointerEvents: isOpen ? "auto" : "none",
        }}
        className="absolute inset-0 z-10"
      />

      {/* Sliding card — animates `top` to avoid a Chromium layout
          bug with `transform` on absolute elements in flex+scroll. */}
      <div
        style={{
          zIndex: 11,
          top: isOpen ? "15%" : `calc(100% - ${totalBarsHeight}px)`,
          transition: "top 0.25s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        className="pointer-events-none absolute right-0 bottom-0 left-0 flex flex-col border-t border-t-(--gray-6) bg-(--color-background)"
      >
        <div className="pointer-events-auto shrink-0">
          {bars.map((bar, index) => (
            <BarRow
              key={bar.relationship}
              bar={bar}
              index={index}
              isExpanded={expanded === bar.relationship}
              onToggle={() => toggle(bar.relationship)}
              onRunAction={onRunInCloud}
            />
          ))}
        </div>

        <div
          style={{ pointerEvents: isOpen ? "auto" : "none" }}
          className="min-h-0 flex-1 overflow-hidden"
        >
          {expandedBar?.task && (
            <TaskLogsPanel
              key={expandedBar.task.id}
              taskId={expandedBar.task.id}
              task={expandedBar.task}
              hideInput={reportStatus !== "ready"}
            />
          )}
        </div>
      </div>
    </>
  );
}
