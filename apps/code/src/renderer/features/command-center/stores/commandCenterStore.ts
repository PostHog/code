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

interface CommandCenterStoreState {
  layout: LayoutPreset;
  cells: (string | null)[];
  zoom: number;
}

interface CommandCenterStoreActions {
  setLayout: (preset: LayoutPreset) => void;
  assignTask: (cellIndex: number, taskId: string) => void;
  removeTask: (cellIndex: number) => void;
  clearAll: () => void;
  setZoom: (zoom: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
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
      zoom: 1,

      setLayout: (preset) =>
        set((state) => ({
          layout: preset,
          cells: resizeCells(state.cells, getCellCount(preset)),
        })),

      assignTask: (cellIndex, taskId) =>
        set((state) => {
          if (cellIndex < 0 || cellIndex >= state.cells.length) return state;
          const cells = [...state.cells];
          const existingIndex = cells.indexOf(taskId);
          if (existingIndex !== -1) {
            cells[existingIndex] = null;
          }
          cells[cellIndex] = taskId;
          return { cells };
        }),

      removeTask: (cellIndex) =>
        set((state) => {
          const cells = [...state.cells];
          cells[cellIndex] = null;
          return { cells };
        }),

      clearAll: () =>
        set((state) => ({
          cells: state.cells.map(() => null),
        })),

      setZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
      zoomIn: () =>
        set((state) => ({ zoom: clampZoom(state.zoom + ZOOM_STEP) })),
      zoomOut: () =>
        set((state) => ({ zoom: clampZoom(state.zoom - ZOOM_STEP) })),
    }),
    {
      name: "command-center-storage",
      storage: electronStorage,
      partialize: (state) => ({
        layout: state.layout,
        cells: state.cells,
        zoom: state.zoom,
      }),
    },
  ),
);
