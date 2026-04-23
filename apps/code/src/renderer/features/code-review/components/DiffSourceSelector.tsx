import { CaretDown, GitBranch, HardDrives } from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@posthog/quill";
import { useDiffViewerStore } from "@renderer/features/code-editor/stores/diffViewerStore";
import type { ResolvedDiffSource } from "../utils/resolveDiffSource";

interface DiffSourceSelectorProps {
  taskId: string;
  effectiveSource: ResolvedDiffSource;
  branchAvailable: boolean;
  defaultBranch: string | null;
}

export function DiffSourceSelector({
  taskId,
  effectiveSource,
  branchAvailable,
  defaultBranch,
}: DiffSourceSelectorProps) {
  const setDiffSource = useDiffViewerStore((s) => s.setDiffSource);

  if (!branchAvailable || !defaultBranch) return null;

  const Icon = effectiveSource === "branch" ? GitBranch : HardDrives;
  const branchLabel = `Branch vs. ${defaultBranch}`;
  const triggerLabel = effectiveSource === "branch" ? branchLabel : "Local";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            variant="default"
            className="rounded-xs"
            aria-label="Diff source"
          >
            <Icon size={12} />
            <span className="whitespace-nowrap">{triggerLabel}</span>
            <CaretDown size={10} weight="bold" />
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="min-w-[160px]"
      >
        <DropdownMenuItem onClick={() => setDiffSource(taskId, "local")}>
          <HardDrives size={12} />
          Local changes
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setDiffSource(taskId, "branch")}>
          <GitBranch size={12} />
          {branchLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
