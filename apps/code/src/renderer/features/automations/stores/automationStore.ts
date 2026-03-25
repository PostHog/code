import { electronStorage } from "@renderer/utils/electronStorage";
import type { Automation } from "@shared/types/automations";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { computeNextRunAt, getLocalTimezone } from "../utils/schedule";

interface CreateAutomationInput {
  name: string;
  prompt: string;
  repoPath: string;
  repository?: string | null;
  githubIntegrationId?: number | null;
  scheduleTime: string;
  templateId?: string | null;
}

interface UpdateAutomationInput extends Partial<CreateAutomationInput> {
  enabled?: boolean;
}

interface RunResultInput {
  automationId: string;
  status: Automation["lastRunStatus"];
  taskId?: string | null;
  error?: string | null;
  ranAt?: string;
  advanceSchedule?: boolean;
}

interface AutomationStoreState {
  automations: Automation[];
  selectedAutomationId: string | null;
  runningAutomationIds: string[];
  hasHydrated: boolean;
}

interface AutomationStoreActions {
  setHasHydrated: (hasHydrated: boolean) => void;
  setSelectedAutomationId: (automationId: string | null) => void;
  createAutomation: (input: CreateAutomationInput) => string;
  updateAutomation: (
    automationId: string,
    updates: UpdateAutomationInput,
  ) => void;
  deleteAutomation: (automationId: string) => void;
  toggleAutomation: (automationId: string) => void;
  markRunning: (automationId: string, isRunning: boolean) => void;
  recordRunResult: (input: RunResultInput) => void;
  normalizeSchedules: (now?: Date) => void;
}

type AutomationStore = AutomationStoreState & AutomationStoreActions;

function sortAutomations(automations: Automation[]): Automation[] {
  return [...automations].sort((a, b) => {
    if (a.enabled !== b.enabled) {
      return a.enabled ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
}

function buildAutomation(input: CreateAutomationInput): Automation {
  const nowIso = new Date().toISOString();
  const timezone = getLocalTimezone();

  return {
    id: crypto.randomUUID(),
    name: input.name.trim(),
    prompt: input.prompt.trim(),
    repoPath: input.repoPath,
    repository: input.repository ?? null,
    githubIntegrationId: input.githubIntegrationId ?? null,
    scheduleTime: input.scheduleTime,
    timezone,
    enabled: true,
    templateId: input.templateId ?? null,
    createdAt: nowIso,
    updatedAt: nowIso,
    nextRunAt: computeNextRunAt(input.scheduleTime, timezone),
    lastRunAt: null,
    lastRunStatus: null,
    lastTaskId: null,
    lastError: null,
  };
}

function updateNextRunAt(automation: Automation, now = new Date()): Automation {
  return {
    ...automation,
    nextRunAt: automation.enabled
      ? computeNextRunAt(automation.scheduleTime, automation.timezone, now)
      : null,
  };
}

export const useAutomationStore = create<AutomationStore>()(
  persist(
    (set) => ({
      automations: [],
      selectedAutomationId: null,
      runningAutomationIds: [],
      hasHydrated: false,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      setSelectedAutomationId: (automationId) =>
        set({ selectedAutomationId: automationId }),

      createAutomation: (input) => {
        const automation = buildAutomation(input);
        set((state) => ({
          automations: sortAutomations([...state.automations, automation]),
          selectedAutomationId: automation.id,
        }));
        return automation.id;
      },

      updateAutomation: (automationId, updates) =>
        set((state) => ({
          automations: sortAutomations(
            state.automations.map((automation) => {
              if (automation.id !== automationId) {
                return automation;
              }

              const next: Automation = {
                ...automation,
                ...updates,
                name: updates.name?.trim() ?? automation.name,
                prompt: updates.prompt?.trim() ?? automation.prompt,
                updatedAt: new Date().toISOString(),
              };

              return updateNextRunAt(next);
            }),
          ),
        })),

      deleteAutomation: (automationId) =>
        set((state) => ({
          automations: state.automations.filter(
            (item) => item.id !== automationId,
          ),
          selectedAutomationId:
            state.selectedAutomationId === automationId
              ? null
              : state.selectedAutomationId,
          runningAutomationIds: state.runningAutomationIds.filter(
            (item) => item !== automationId,
          ),
        })),

      toggleAutomation: (automationId) =>
        set((state) => ({
          automations: sortAutomations(
            state.automations.map((automation) => {
              if (automation.id !== automationId) {
                return automation;
              }

              const next = {
                ...automation,
                enabled: !automation.enabled,
                updatedAt: new Date().toISOString(),
              };

              return updateNextRunAt(next);
            }),
          ),
        })),

      markRunning: (automationId, isRunning) =>
        set((state) => ({
          runningAutomationIds: isRunning
            ? [...new Set([...state.runningAutomationIds, automationId])]
            : state.runningAutomationIds.filter(
                (item) => item !== automationId,
              ),
        })),

      recordRunResult: ({
        automationId,
        status,
        taskId,
        error,
        ranAt,
        advanceSchedule = false,
      }) =>
        set((state) => ({
          automations: sortAutomations(
            state.automations.map((automation) => {
              if (automation.id !== automationId) {
                return automation;
              }

              const completedAt = ranAt ?? new Date().toISOString();
              const nextBase = {
                ...automation,
                lastRunAt: completedAt,
                lastRunStatus: status ?? null,
                lastTaskId: taskId ?? null,
                lastError: error ?? null,
                updatedAt: completedAt,
              };

              return advanceSchedule ? updateNextRunAt(nextBase) : nextBase;
            }),
          ),
        })),

      normalizeSchedules: (now = new Date()) =>
        set((state) => ({
          automations: sortAutomations(
            state.automations.map((automation) => {
              if (!automation.enabled) {
                return { ...automation, nextRunAt: null };
              }

              const timezone = automation.timezone || getLocalTimezone();
              const nextRunAt = computeNextRunAt(
                automation.scheduleTime,
                timezone,
                now,
              );

              return {
                ...automation,
                timezone,
                nextRunAt,
              };
            }),
          ),
        })),
    }),
    {
      name: "automations-storage",
      storage: electronStorage,
      partialize: (state) => ({
        automations: state.automations,
        selectedAutomationId: state.selectedAutomationId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.normalizeSchedules(new Date());
        if (state) {
          state.setHasHydrated(true);
        }
      },
    },
  ),
);
