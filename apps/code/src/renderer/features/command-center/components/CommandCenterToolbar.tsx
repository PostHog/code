import { getSessionService } from "@features/sessions/service/service";
import {
  MagnifyingGlassMinus,
  MagnifyingGlassPlus,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { Flex, Select, Text } from "@radix-ui/themes";
import type {
  CommandCenterCellData,
  StatusSummary,
} from "../hooks/useCommandCenterData";
import {
  type LayoutPreset,
  useCommandCenterStore,
} from "../stores/commandCenterStore";

const LAYOUT_OPTIONS: { value: LayoutPreset; label: string }[] = [
  { value: "1x1", label: "1x1" },
  { value: "2x1", label: "2x1" },
  { value: "1x2", label: "1x2" },
  { value: "2x2", label: "2x2" },
  { value: "3x2", label: "3x2" },
  { value: "3x3", label: "3x3" },
];

interface CommandCenterToolbarProps {
  summary: StatusSummary;
  cells: CommandCenterCellData[];
}

function StatusSummaryText({ summary }: { summary: StatusSummary }) {
  if (summary.total === 0) return null;

  const parts: string[] = [
    `${summary.total} agent${summary.total !== 1 ? "s" : ""}`,
  ];
  if (summary.running > 0) parts.push(`${summary.running} running`);
  if (summary.waiting > 0) parts.push(`${summary.waiting} waiting`);

  return (
    <Text size="1" className="font-mono text-[11px] text-gray-10">
      {parts.join(" \u00b7 ")}
    </Text>
  );
}

export function CommandCenterToolbar({
  summary,
  cells,
}: CommandCenterToolbarProps) {
  const layout = useCommandCenterStore((s) => s.layout);
  const setLayout = useCommandCenterStore((s) => s.setLayout);
  const clearAll = useCommandCenterStore((s) => s.clearAll);
  const zoom = useCommandCenterStore((s) => s.zoom);
  const zoomIn = useCommandCenterStore((s) => s.zoomIn);
  const zoomOut = useCommandCenterStore((s) => s.zoomOut);

  const hasActiveAgents = summary.running > 0 || summary.waiting > 0;

  const stopAll = () => {
    const service = getSessionService();
    for (const cell of cells) {
      if (
        cell.taskId &&
        (cell.status === "running" || cell.status === "waiting")
      ) {
        service.cancelPrompt(cell.taskId);
      }
    }
  };

  return (
    <Flex
      align="center"
      gap="3"
      px="3"
      py="2"
      className="shrink-0 border-gray-6 border-b"
    >
      <Select.Root
        value={layout}
        onValueChange={(v) => setLayout(v as LayoutPreset)}
      >
        <Select.Trigger variant="ghost" className="font-mono text-[11px]" />
        <Select.Content>
          {LAYOUT_OPTIONS.map((opt) => (
            <Select.Item key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>

      <StatusSummaryText summary={summary} />

      <Flex align="center" gap="1">
        <button
          type="button"
          onClick={zoomOut}
          disabled={zoom <= 0.5}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12 disabled:opacity-40"
          title="Zoom out"
        >
          <MagnifyingGlassMinus size={14} />
        </button>
        <Text
          size="1"
          className="w-8 text-center font-mono text-[11px] text-gray-10"
        >
          {Math.round(zoom * 100)}%
        </Text>
        <button
          type="button"
          onClick={zoomIn}
          disabled={zoom >= 1.5}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12 disabled:opacity-40"
          title="Zoom in"
        >
          <MagnifyingGlassPlus size={14} />
        </button>
      </Flex>

      <div className="flex-1" />

      <button
        type="button"
        onClick={stopAll}
        disabled={!hasActiveAgents}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-red-10 transition-colors hover:bg-red-3 hover:text-red-11 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-red-10"
        title="Stop all agents"
      >
        <Stop size={12} weight="fill" />
        Stop All
      </button>

      <button
        type="button"
        onClick={clearAll}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
        title="Clear all cells"
      >
        <Trash size={12} />
        Clear
      </button>
    </Flex>
  );
}
