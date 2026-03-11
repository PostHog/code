import { useCallback, useState } from "react";
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

function GridCell({
  cell,
  zoom,
}: {
  cell: CommandCenterCellData;
  zoom: number;
}) {
  const [isDragOver, setIsDragOver] = useState(false);

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
    // biome-ignore lint/a11y/noStaticElementInteractions: drop target for drag-and-drop task assignment
    <div
      className="overflow-hidden bg-gray-1"
      style={{
        outline: isDragOver ? "2px solid var(--accent-9)" : undefined,
        outlineOffset: "-2px",
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="h-full w-full origin-top-left"
        style={{
          zoom: zoom !== 1 ? zoom : undefined,
        }}
      >
        <CommandCenterPanel cell={cell} />
      </div>
    </div>
  );
}

export function CommandCenterGrid({ layout, cells }: CommandCenterGridProps) {
  const { cols, rows } = getGridDimensions(layout);
  const zoom = useCommandCenterStore((s) => s.zoom);

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
        <GridCell key={cell.cellIndex} cell={cell} zoom={zoom} />
      ))}
    </div>
  );
}
