import { clearSummaryCache } from "@features/command-center/hooks/useSummary";
import { trpcClient } from "@renderer/trpc/client";
import { electronStorage } from "@utils/electronStorage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type LayoutPreset = "1x1" | "2x1" | "1x2" | "2x2" | "3x2" | "3x3";

interface GridDimensions {
  cols: number;
  rows: number;
}

export function getGridDimensions(preset: LayoutPreset): GridDimensions {
  const [cols, rows] = preset.split("x").map(Number);
  return { cols, rows };
}

function getCellCount(preset: LayoutPreset): number {
  const { cols, rows } = getGridDimensions(preset);
  return cols * rows;
}

export type ViewMode = "tasks" | "automations";

interface CommandCenterStoreState {
  layout: LayoutPreset;
  cells: (string | null)[];
  activeTaskId: string | null;
  zoom: number;
  viewMode: ViewMode;
  dismissedRunIds: string[];
  summarize: boolean;
  /** Task IDs that couldn't fit in the grid and are waiting for a free cell */
  pendingQueue: string[];
}

interface CommandCenterStoreActions {
  setLayout: (preset: LayoutPreset) => void;
  setActiveTask: (taskId: string | null) => void;
  assignTask: (cellIndex: number, taskId: string) => void;
  removeTask: (cellIndex: number) => void;
  removeTaskById: (taskId: string) => void;
  clearAll: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  setViewMode: (mode: ViewMode) => void;
  dismissRun: (runId: string) => void;
  clearDismissed: () => void;
  toggleSummarize: () => void;
  /** Assign a task ID to the first empty cell, expanding layout if needed */
  assignTaskToFirstEmpty: (taskId: string) => void;
  /** Add an automation run to the first empty cell. Cell value uses "auto:<runId>" prefix. */
  autoPopulateAutomationRun: (runId: string) => void;
  /** Bulk-add automation runs to empty cells */
  autoPopulateAutomationRuns: (runIds: string[]) => void;
}

type CommandCenterStore = CommandCenterStoreState & CommandCenterStoreActions;

function resizeCells(
  current: (string | null)[],
  newCount: number,
): (string | null)[] {
  if (current.length === newCount) return current;
  if (current.length > newCount) return current.slice(0, newCount);
  return [...current, ...Array(newCount - current.length).fill(null)];
}

const LAYOUT_PROGRESSION: LayoutPreset[] = [
  "1x1",
  "2x1",
  "1x2",
  "2x2",
  "3x2",
  "3x3",
];

function expandLayout(current: LayoutPreset): LayoutPreset {
  const idx = LAYOUT_PROGRESSION.indexOf(current);
  if (idx === -1 || idx >= LAYOUT_PROGRESSION.length - 1) return current;
  return LAYOUT_PROGRESSION[idx + 1];
}

/** Check if a cell ID represents an automation run */
export function isAutomationCell(cellId: string | null): boolean {
  return cellId?.startsWith("auto:");
}

/** Extract the automation run ID from a cell ID */
export function getAutomationRunId(cellId: string): string {
  return cellId.slice(5); // Remove "auto:" prefix
}

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.1;

function clampZoom(value: number): number {
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 10) / 10;
}

export const useCommandCenterStore = create<CommandCenterStore>()(
  persist(
    (set) => ({
      layout: "2x2",
      cells: [null, null, null, null],
      activeTaskId: null,
      zoom: 1,
      viewMode: "tasks" as ViewMode,
      dismissedRunIds: [] as string[],
      summarize: false,
      pendingQueue: [],

      setLayout: (preset) =>
        set((state) => ({
          activeTaskId: resizeCells(state.cells, getCellCount(preset)).includes(
            state.activeTaskId,
          )
            ? state.activeTaskId
            : null,
          layout: preset,
          cells: resizeCells(state.cells, getCellCount(preset)),
        })),

      setActiveTask: (taskId) => set({ activeTaskId: taskId }),

      assignTask: (cellIndex, taskId) =>
        set((state) => {
          if (cellIndex < 0 || cellIndex >= state.cells.length) return state;
          const cells = [...state.cells];
          const existingIndex = cells.indexOf(taskId);
          if (existingIndex !== -1) {
            cells[existingIndex] = null;
          }
          cells[cellIndex] = taskId;
          return { cells, activeTaskId: taskId };
        }),

      removeTask: (cellIndex) =>
        set((state) => {
          const cells = [...state.cells];
          const removedTaskId = cells[cellIndex];
          cells[cellIndex] = null;
          const pendingQueue = [...state.pendingQueue];
          let activeTaskId =
            removedTaskId && state.activeTaskId === removedTaskId
              ? null
              : state.activeTaskId;
          // Fill the empty cell from the pending queue
          if (pendingQueue.length > 0) {
            const nextTaskId = pendingQueue.shift()!;
            cells[cellIndex] = nextTaskId;
            activeTaskId = nextTaskId;
          }
          return { cells, activeTaskId, pendingQueue };
        }),

      removeTaskById: (taskId) =>
        set((state) => {
          const index = state.cells.indexOf(taskId);
          if (index === -1) return state;
          const cells = [...state.cells];
          cells[index] = null;
          const pendingQueue = [...state.pendingQueue];
          let activeTaskId =
            state.activeTaskId === taskId ? null : state.activeTaskId;
          // Fill the empty cell from the pending queue
          if (pendingQueue.length > 0) {
            const nextTaskId = pendingQueue.shift()!;
            cells[index] = nextTaskId;
            activeTaskId = nextTaskId;
          }
          return { cells, activeTaskId, pendingQueue };
        }),

      clearAll: () =>
        set((state) => {
          const cells: (string | null)[] = state.cells.map(() => null);
          const pendingQueue = [...state.pendingQueue];
          let activeTaskId: string | null = null;
          // Fill cleared cells from the pending queue
          for (let i = 0; i < cells.length && pendingQueue.length > 0; i++) {
            const nextTaskId = pendingQueue.shift()!;
            cells[i] = nextTaskId;
            if (!activeTaskId) activeTaskId = nextTaskId;
          }
          return { activeTaskId, cells, pendingQueue };
        }),

      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      zoomIn: () =>
        set((state) => ({ zoom: clampZoom(state.zoom + ZOOM_STEP) })),
      zoomOut: () =>
        set((state) => ({ zoom: clampZoom(state.zoom - ZOOM_STEP) })),

      setViewMode: (mode) => set({ viewMode: mode }),
      dismissRun: (runId) =>
        set((state) => ({
          dismissedRunIds: [...state.dismissedRunIds, runId],
        })),
      clearDismissed: () => set({ dismissedRunIds: [] }),
      toggleSummarize: () => {
        clearSummaryCache();
        return set((state) => ({ summarize: !state.summarize }));
      },
      assignTaskToFirstEmpty: (taskId) =>
        set((state) => {
          if (state.cells.includes(taskId)) return state;
          const pendingQueue = state.pendingQueue.filter((id) => id !== taskId);
          const cells = [...state.cells];
          const emptyIndex = cells.indexOf(null);
          if (emptyIndex !== -1) {
            cells[emptyIndex] = taskId;
            return { cells, activeTaskId: taskId, pendingQueue };
          }
          const nextLayout = expandLayout(state.layout);
          if (nextLayout !== state.layout) {
            const expanded = resizeCells(cells, getCellCount(nextLayout));
            const newEmpty = expanded.indexOf(null);
            if (newEmpty !== -1) {
              expanded[newEmpty] = taskId;
            }
            return {
              layout: nextLayout,
              cells: expanded,
              activeTaskId: taskId,
              pendingQueue,
            };
          }
          // Grid is full — queue the task for when a cell frees up
          if (!pendingQueue.includes(taskId)) {
            return { pendingQueue: [...pendingQueue, taskId] };
          }
          return state;
        }),
      autoPopulateAutomationRun: (runId) =>
        set((state) => {
          const cellId = `auto:${runId}`;
          // Don't add if already in grid
          if (state.cells.includes(cellId)) return state;
          const cells = [...state.cells];

          // Try empty cell first
          const emptyIndex = cells.indexOf(null);
          if (emptyIndex !== -1) {
            cells[emptyIndex] = cellId;
            return { cells };
          }

          // Try expanding layout
          const nextLayout = expandLayout(state.layout);
          if (nextLayout !== state.layout) {
            const expanded = resizeCells(cells, getCellCount(nextLayout));
            const newEmpty = expanded.indexOf(null);
            if (newEmpty !== -1) {
              expanded[newEmpty] = cellId;
            }
            return { layout: nextLayout, cells: expanded };
          }

          // All cells full and can't expand — replace the first automation cell
          const autoIndex = cells.findIndex(
            (c) => c !== null && isAutomationCell(c) && c !== cellId,
          );
          if (autoIndex !== -1) {
            cells[autoIndex] = cellId;
            return { cells };
          }

          // No automation cells to replace — skip
          return state;
        }),
      autoPopulateAutomationRuns: (runIds) =>
        set((state) => {
          let { layout, cells } = state;
          cells = [...cells];
          for (const runId of runIds) {
            const cellId = `auto:${runId}`;
            if (cells.includes(cellId)) continue;
            let emptyIndex = cells.indexOf(null);
            if (emptyIndex === -1) {
              layout = expandLayout(layout);
              cells = resizeCells(cells, getCellCount(layout));
              emptyIndex = cells.indexOf(null);
            }
            if (emptyIndex !== -1) {
              cells[emptyIndex] = cellId;
            }
          }
          return { layout, cells };
        }),
    }),
    {
      name: "command-center-storage",
      storage: electronStorage,
      partialize: (state) => ({
        layout: state.layout,
        cells: state.cells,
        activeTaskId: state.activeTaskId,
        zoom: state.zoom,
        viewMode: state.viewMode,
        dismissedRunIds: state.dismissedRunIds,
      }),
    },
  ),
);

// Global subscription: auto-populate automation runs into the grid
// regardless of which page the user is on.
trpcClient.automations.onRunStarted.subscribe(undefined, {
  onData: (run) => {
    useCommandCenterStore.getState().autoPopulateAutomationRun(run.id);
  },
});
trpcClient.automations.onRunCompleted.subscribe(undefined, {
  onData: (run) => {
    useCommandCenterStore.getState().autoPopulateAutomationRun(run.id);
  },
});
