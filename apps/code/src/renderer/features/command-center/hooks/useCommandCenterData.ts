import { useSessions } from "@features/sessions/hooks/useSession";
import type { AgentSession } from "@features/sessions/stores/sessionStore";
import { useTasks } from "@features/tasks/hooks/useTasks";
import type { Task } from "@shared/types";
import type { Automation, AutomationRunInfo } from "@shared/types/automations";
import { getTaskRepository, parseRepository } from "@utils/repository";
import { useMemo } from "react";
import {
  getAutomationRunId,
  isAutomationCell,
  useCommandCenterStore,
} from "../stores/commandCenterStore";

export type CellStatus = "running" | "waiting" | "idle" | "error" | "completed";

export interface CommandCenterCellData {
  cellIndex: number;
  taskId: string | null;
  automationRunId: string | null;
  task: Task | undefined;
  session: AgentSession | undefined;
  automationRun: AutomationRunInfo | undefined;
  automationName: string | undefined;
  status: CellStatus;
  repoName: string | null;
}

export interface StatusSummary {
  total: number;
  running: number;
  waiting: number;
  idle: number;
  error: number;
  completed: number;
}

export function deriveStatus(session: AgentSession | undefined): CellStatus {
  if (!session) return "idle";

  if (session.status === "error") return "error";
  if (session.cloudStatus === "failed" || session.cloudStatus === "cancelled")
    return "error";
  if (session.cloudStatus === "completed") return "completed";

  if (session.pendingPermissions.size > 0) return "waiting";

  if (session.status === "connected" && session.isPromptPending)
    return "running";

  return "idle";
}

function getRepoName(task: Task): string | null {
  const repository = getTaskRepository(task);
  if (!repository) return null;
  const parsed = parseRepository(repository);
  return parsed?.repoName ?? repository;
}

export function useCommandCenterData(
  automationRuns?: AutomationRunInfo[],
  automations?: Automation[],
): {
  cells: CommandCenterCellData[];
  summary: StatusSummary;
} {
  const storeCells = useCommandCenterStore((s) => s.cells);
  const { data: tasks = [] } = useTasks();
  const sessions = useSessions();

  const taskMap = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      map.set(task.id, task);
    }
    return map;
  }, [tasks]);

  const sessionByTaskId = useMemo(() => {
    const map = new Map<string, AgentSession>();
    for (const session of Object.values(sessions)) {
      if (session.taskId) {
        map.set(session.taskId, session);
      }
    }
    return map;
  }, [sessions]);

  const automationRunMap = useMemo(() => {
    const map = new Map<string, AutomationRunInfo>();
    for (const run of automationRuns ?? []) {
      map.set(run.id, run);
    }
    return map;
  }, [automationRuns]);

  const automationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of automations ?? []) {
      map.set(a.id, a.name);
    }
    return map;
  }, [automations]);

  const cells = useMemo(() => {
    return storeCells.map((cellId, cellIndex) => {
      if (cellId && isAutomationCell(cellId)) {
        const runId = getAutomationRunId(cellId);
        const run = automationRunMap.get(runId);
        const name = run
          ? automationNameMap.get(run.automationId)
          : undefined;
        const status: CellStatus = run
          ? run.status === "running"
            ? "running"
            : run.status === "success"
              ? "completed"
              : "error"
          : "idle";

        return {
          cellIndex,
          taskId: null,
          automationRunId: runId,
          task: undefined,
          session: undefined,
          automationRun: run,
          automationName: name,
          status,
          repoName: null,
        };
      }

      const taskId = cellId;
      const task = taskId ? taskMap.get(taskId) : undefined;
      const session = taskId ? sessionByTaskId.get(taskId) : undefined;
      const status = taskId ? deriveStatus(session) : "idle";
      const repoName = task ? getRepoName(task) : null;

      return {
        cellIndex,
        taskId,
        automationRunId: null,
        task,
        session,
        automationRun: undefined,
        automationName: undefined,
        status,
        repoName,
      };
    });
  }, [
    storeCells,
    taskMap,
    sessionByTaskId,
    automationRunMap,
    automationNameMap,
  ]);

  const summary = useMemo(() => {
    const populated = cells.filter(
      (c) => c.taskId || c.automationRunId,
    );
    return {
      total: populated.length,
      running: populated.filter((c) => c.status === "running").length,
      waiting: populated.filter((c) => c.status === "waiting").length,
      idle: populated.filter((c) => c.status === "idle").length,
      error: populated.filter((c) => c.status === "error").length,
      completed: populated.filter((c) => c.status === "completed").length,
    };
  }, [cells]);

  return { cells, summary };
}
