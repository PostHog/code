import { useAuthStore } from "@features/auth/stores/authStore";
import type { TaskService } from "@features/task-detail/service/service";
import { get } from "@renderer/di/container";
import { RENDERER_TOKENS } from "@renderer/di/tokens";
import { queryClient } from "@utils/queryClient";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useAutomationStore } from "../stores/automationStore";

const SCHEDULER_INTERVAL_MS = 30_000;

export function useAutomationScheduler(): void {
  const hasHydrated = useAutomationStore((state) => state.hasHydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const initializedRef = useRef(false);
  const runningIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    if (!initializedRef.current) {
      useAutomationStore.getState().normalizeSchedules(new Date());
      initializedRef.current = true;
    }

    const tick = async () => {
      if (!isAuthenticated) {
        return;
      }

      const now = new Date();
      const state = useAutomationStore.getState();
      const dueAutomations = state.automations.filter(
        (automation) =>
          automation.enabled &&
          !!automation.nextRunAt &&
          new Date(automation.nextRunAt).getTime() <= now.getTime() &&
          !runningIdsRef.current.has(automation.id),
      );

      if (dueAutomations.length === 0) {
        return;
      }

      const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);

      for (const automation of dueAutomations) {
        runningIdsRef.current.add(automation.id);
        state.markRunning(automation.id, true);

        try {
          const result = await taskService.createTask({
            content: automation.prompt,
            repoPath: automation.repoPath,
            repository: automation.repository ?? undefined,
            githubIntegrationId: automation.githubIntegrationId ?? undefined,
            workspaceMode: "local",
          });

          if (!result.success) {
            useAutomationStore.getState().recordRunResult({
              automationId: automation.id,
              status: "failed",
              error: result.error ?? "Failed to create task",
              advanceSchedule: true,
            });
            continue;
          }

          void queryClient.invalidateQueries({ queryKey: ["tasks"] });
          useAutomationStore.getState().recordRunResult({
            automationId: automation.id,
            status: "success",
            taskId: result.data.task.id,
            advanceSchedule: true,
          });
        } catch (error) {
          useAutomationStore.getState().recordRunResult({
            automationId: automation.id,
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            advanceSchedule: true,
          });
        } finally {
          runningIdsRef.current.delete(automation.id);
          useAutomationStore.getState().markRunning(automation.id, false);
        }
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, SCHEDULER_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasHydrated, isAuthenticated]);
}

export async function runAutomationNow(automationId: string): Promise<boolean> {
  const state = useAutomationStore.getState();
  const automation = state.automations.find((item) => item.id === automationId);

  if (!automation) {
    toast.error("Automation not found");
    return false;
  }

  if (state.runningAutomationIds.includes(automationId)) {
    return false;
  }

  const isAuthenticated = useAuthStore.getState().isAuthenticated;
  if (!isAuthenticated) {
    toast.error("Sign in to run automations");
    return false;
  }

  state.markRunning(automationId, true);

  try {
    const taskService = get<TaskService>(RENDERER_TOKENS.TaskService);
    const result = await taskService.createTask({
      content: automation.prompt,
      repoPath: automation.repoPath,
      repository: automation.repository ?? undefined,
      githubIntegrationId: automation.githubIntegrationId ?? undefined,
      workspaceMode: "local",
    });

    if (!result.success) {
      state.recordRunResult({
        automationId,
        status: "failed",
        error: result.error ?? "Failed to create task",
        advanceSchedule: false,
      });
      toast.error(result.error ?? "Failed to run automation");
      return false;
    }

    void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    state.recordRunResult({
      automationId,
      status: "success",
      taskId: result.data.task.id,
      advanceSchedule: false,
    });
    toast.success("Automation started");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    state.recordRunResult({
      automationId,
      status: "failed",
      error: message,
      advanceSchedule: false,
    });
    toast.error(message);
    return false;
  } finally {
    state.markRunning(automationId, false);
  }
}
