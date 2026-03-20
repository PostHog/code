import { useCallback, useEffect, useRef, useState } from "react";
import type { CommandCenterCellData } from "../hooks/useCommandCenterData";
import {
  getGridDimensions,
  type LayoutPreset,
  useCommandCenterStore,
} from "../stores/commandCenterStore";
import { CommandCenterPanel } from "./CommandCenterPanel";

interface CommandCenterGridProps {
  layout: LayoutPreset;
  cells: CommandCenterCellData[];
}

function useTaskDragActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("text/x-task-id")) {
        setActive(true);
      }
    };
    const onDragEnd = () => setActive(false);
    const onDrop = () => setActive(false);
    const onDragLeave = (e: DragEvent) => {
      if (!e.relatedTarget) setActive(false);
    };

    document.addEventListener("dragstart", onDragStart);
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("drop", onDrop);
    document.addEventListener("dragleave", onDragLeave);
    return () => {
      document.removeEventListener("dragstart", onDragStart);
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("drop", onDrop);
      document.removeEventListener("dragleave", onDragLeave);
    };
  }, []);

  return active;
}

function GridCell({
  cell,
  zoom,
  isDragActive,
  activeTaskId,
}: {
  cell: CommandCenterCellData;
  zoom: number;
  isDragActive: boolean;
  activeTaskId: string | null;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const setActiveTask = useCommandCenterStore((s) => s.setActiveTask);
  const isActive = !!cell.taskId && activeTaskId === cell.taskId;

  const handleCellClick = useCallback(() => {
    setActiveTask(cell.taskId);
    const actionSelector =
      cellRef.current?.querySelector<HTMLElement>("[tabindex='0']");
    actionSelector?.focus();
  }, [cell.taskId, setActiveTask]);

  const handleCellPointerDownCapture = useCallback(() => {
    setActiveTask(cell.taskId);
  }, [cell.taskId, setActiveTask]);

  const handleCellFocusCapture = useCallback(() => {
    setActiveTask(cell.taskId);
  }, [cell.taskId, setActiveTask]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("text/x-task-id")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const taskId = e.dataTransfer.getData("text/x-task-id");
      if (taskId) {
        useCommandCenterStore.getState().assignTask(cell.cellIndex, taskId);
      }
    },
    [cell.cellIndex],
  );

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/noStaticElementInteractions: click delegates focus to ActionSelector within
    <div
      ref={cellRef}
      className={`relative overflow-hidden bg-gray-1 focus-within:ring-2 focus-within:ring-accent-9 focus-within:ring-inset ${
        isActive ? "ring-2 ring-accent-9 ring-inset" : ""
      }`}
      onClick={handleCellClick}
      onPointerDownCapture={handleCellPointerDownCapture}
      onFocusCapture={handleCellFocusCapture}
    >
      <div
        className="h-full w-full origin-top-left"
        style={{
          zoom: zoom !== 1 ? zoom : undefined,
        }}
      >
        <CommandCenterPanel cell={cell} isActiveSession={isActive} />
      </div>
      {isDragActive && (
        // biome-ignore lint/a11y/noStaticElementInteractions: transparent overlay to capture drag events over session content
        <div
          className="absolute inset-0"
          style={{
            outline: isDragOver ? "2px solid var(--accent-9)" : undefined,
            outlineOffset: "-2px",
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        />
      )}
    </div>
  );
}

export function CommandCenterGrid({ layout, cells }: CommandCenterGridProps) {
  const { cols, rows } = getGridDimensions(layout);
  const zoom = useCommandCenterStore((s) => s.zoom);
  const activeTaskId = useCommandCenterStore((s) => s.activeTaskId);
  const isDragActive = useTaskDragActive();

  return (
    <div
      className="h-full bg-gray-6"
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: "1px",
      }}
    >
      {cells.map((cell) => (
        <GridCell
          key={cell.cellIndex}
          cell={cell}
          zoom={zoom}
          isDragActive={isDragActive}
          activeTaskId={activeTaskId}
        />
      ))}
    </div>
  );
}
