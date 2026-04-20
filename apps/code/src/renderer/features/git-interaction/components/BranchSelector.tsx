import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import { getSuggestedBranchName } from "@features/git-interaction/utils/getSuggestedBranchName";
import { invalidateGitBranchQueries } from "@features/git-interaction/utils/gitCacheKeys";
import { CaretDown, GitBranch, Plus, Spinner } from "@phosphor-icons/react";
import {
  Button,
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxListFooter,
  ComboboxTrigger,
} from "@posthog/quill";
import { useTRPC } from "@renderer/trpc";
import { toast } from "@renderer/utils/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";

interface BranchSelectorProps {
  repoPath: string | null;
  currentBranch: string | null;
  defaultBranch?: string | null;
  disabled?: boolean;
  loading?: boolean;
  variant?: "outline" | "ghost";
  workspaceMode?: "worktree" | "local" | "cloud";
  selectedBranch?: string | null;
  onBranchSelect?: (branch: string | null) => void;
  cloudBranches?: string[];
  cloudBranchesLoading?: boolean;
  cloudBranchesFetchingMore?: boolean;
  onCloudPickerOpen?: () => void;
  onCloudBranchCommit?: () => void;
  taskId?: string;
  anchor?: RefObject<HTMLElement | null>;
}

export function BranchSelector({
  repoPath,
  currentBranch,
  defaultBranch,
  disabled,
  loading,
  workspaceMode,
  selectedBranch,
  onBranchSelect,
  cloudBranches,
  cloudBranchesLoading,
  cloudBranchesFetchingMore,
  onCloudPickerOpen,
  onCloudBranchCommit,
  taskId,
  anchor,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const localAnchorRef = useRef<HTMLButtonElement>(null);
  const trpc = useTRPC();
  const { actions } = useGitInteractionStore();

  const isCloudMode = workspaceMode === "cloud";
  const isSelectionOnly = workspaceMode === "worktree" || isCloudMode;
  const displayedBranch = isSelectionOnly ? selectedBranch : currentBranch;

  useEffect(() => {
    if (isSelectionOnly && defaultBranch && !selectedBranch && onBranchSelect) {
      onBranchSelect(defaultBranch);
    }
  }, [isSelectionOnly, defaultBranch, selectedBranch, onBranchSelect]);

  const { data: localBranches = [] } = useQuery(
    trpc.git.getAllBranches.queryOptions(
      { directoryPath: repoPath as string },
      { enabled: !isCloudMode && !!repoPath && open, staleTime: 10_000 },
    ),
  );

  const branches = isCloudMode ? (cloudBranches ?? []) : localBranches;
  const CREATE_BRANCH_ACTION = "__create_branch__";
  const allItems = isCloudMode ? branches : [...branches, CREATE_BRANCH_ACTION];
  const effectiveLoading = loading || (isCloudMode && cloudBranchesLoading);
  const cloudStillLoading =
    isCloudMode && cloudBranchesLoading && branches.length === 0;

  const checkoutMutation = useMutation(
    trpc.git.checkoutBranch.mutationOptions({
      onSuccess: () => {
        if (repoPath) invalidateGitBranchQueries(repoPath);
      },
      onError: (error, { branchName }) => {
        const message =
          error instanceof Error ? error.message : "Unknown error occurred";
        toast.error(`Failed to checkout ${branchName}`, {
          description: message,
        });
      },
    }),
  );

  const handleBranchChange = (value: string | null) => {
    if (!value || value === CREATE_BRANCH_ACTION) return;
    if (isSelectionOnly) {
      onBranchSelect?.(value || null);
    } else if (value && value !== currentBranch) {
      checkoutMutation.mutate({
        directoryPath: repoPath as string,
        branchName: value,
      });
    }
    if (isCloudMode && value) {
      onCloudBranchCommit?.();
    }
    setOpen(false);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (isCloudMode && next) {
      onCloudPickerOpen?.();
    }
  };

  const displayText = effectiveLoading
    ? "Loading..."
    : (displayedBranch ?? "No branch");

  const showSpinner =
    effectiveLoading || (isCloudMode && open && cloudBranchesFetchingMore);

  const isDisabled = !!(disabled || !repoPath || cloudStillLoading);

  return (
    <Combobox
      items={allItems}
      value={displayedBranch}
      onValueChange={(v) => handleBranchChange(v as string | null)}
      open={open}
      onOpenChange={(nextOpen) => handleOpenChange(nextOpen)}
      disabled={isDisabled}
    >
      <ComboboxTrigger
        render={
          <Button
            ref={localAnchorRef}
            variant="outline"
            size="sm"
            disabled={isDisabled}
            aria-label="Branch"
            title={displayedBranch ?? undefined}
          >
            {showSpinner ? (
              <Spinner size={14} className="shrink-0 animate-spin" />
            ) : (
              <GitBranch size={14} weight="regular" className="shrink-0" />
            )}
            <span className="min-w-0 truncate">{displayText}</span>
            <CaretDown
              size={10}
              weight="bold"
              className="text-muted-foreground"
            />
          </Button>
        }
      />
      <ComboboxContent
        anchor={anchor ?? localAnchorRef}
        side="bottom"
        sideOffset={6}
        className="min-w-[240px]"
      >
        <ComboboxInput placeholder="Search branches..." showTrigger={false} />

        {isCloudMode && cloudBranchesFetchingMore && (
          <div className="flex items-center gap-1 px-2 py-1.5 text-muted-foreground text-xs">
            <Spinner size={12} className="animate-spin" />
            Loading more ({branches.length})…
          </div>
        )}

        <ComboboxEmpty>No branches found.</ComboboxEmpty>

        <ComboboxList className="max-h-[min(14rem,calc(var(--available-height,14rem)-5rem))] pe-2">
          {(item: string) =>
            item === CREATE_BRANCH_ACTION ? (
              <ComboboxListFooter key="footer">
                <ComboboxItem
                  value={CREATE_BRANCH_ACTION}
                  onClick={() => {
                    setOpen(false);
                    actions.openBranch(
                      taskId
                        ? getSuggestedBranchName(taskId, repoPath ?? undefined)
                        : undefined,
                    );
                  }}
                >
                  <Plus size={11} weight="bold" />
                  Create new branch
                </ComboboxItem>
              </ComboboxListFooter>
            ) : (
              <ComboboxItem
                key={item}
                value={item}
                title={item}
                className="relative"
              >
                {item}
              </ComboboxItem>
            )
          }
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
