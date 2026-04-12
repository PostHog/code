import { Combobox } from "@components/ui/combobox/Combobox";
import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import { getSuggestedBranchName } from "@features/git-interaction/utils/getSuggestedBranchName";
import { invalidateGitBranchQueries } from "@features/git-interaction/utils/gitCacheKeys";
import { GitBranch, Plus } from "@phosphor-icons/react";
import { Flex, Spinner, Tooltip } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc";
import { toast } from "@renderer/utils/toast";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

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
}

export function BranchSelector({
  repoPath,
  currentBranch,
  defaultBranch,
  disabled,
  loading,
  variant = "outline",
  workspaceMode,
  selectedBranch,
  onBranchSelect,
  cloudBranches,
  cloudBranchesLoading,
  cloudBranchesFetchingMore,
  onCloudPickerOpen,
  onCloudBranchCommit,
  taskId,
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
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

  const handleBranchChange = (value: string) => {
    if (isSelectionOnly) {
      onBranchSelect?.(value || null);
    } else if (value && value !== currentBranch) {
      checkoutMutation.mutate({
        directoryPath: repoPath as string,
        branchName: value,
      });
    }
    if (isCloudMode && value) {
      // User committed to a branch — pause the background pagination. If they
      // later re-open the picker, `onCloudPickerOpen` will resume it from
      // wherever the cached pages left off.
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

  // Show the spinner on the trigger while the first page is still loading.
  // Once we have branches to show, any "loading more" background work is
  // surfaced inside the open picker instead, so the trigger goes back to its
  // normal branch icon.
  const showSpinner =
    effectiveLoading || (isCloudMode && open && cloudBranchesFetchingMore);

  const triggerContent = (
    <Flex align="center" gap="2" style={{ minWidth: 0 }}>
      {showSpinner ? (
        <Spinner size="1" />
      ) : (
        <GitBranch size={16} weight="regular" style={{ flexShrink: 0 }} />
      )}
      <span className="combobox-trigger-text">{displayText}</span>
    </Flex>
  );

  return (
    <Tooltip content={displayedBranch} delayDuration={300}>
      <Combobox.Root
        value={displayedBranch ?? ""}
        onValueChange={handleBranchChange}
        open={open}
        onOpenChange={handleOpenChange}
        size="1"
        disabled={disabled || !repoPath || cloudStillLoading}
      >
        <Combobox.Trigger variant={variant} placeholder="No branch">
          {triggerContent}
        </Combobox.Trigger>

        <Combobox.Content
          items={branches}
          limit={50}
          pinned={[displayedBranch, defaultBranch].filter(Boolean) as string[]}
        >
          {({ filtered, hasMore, moreCount }) => (
            <>
              <Combobox.Input placeholder="Search branches" />
              {isCloudMode && cloudBranchesFetchingMore && (
                <Flex
                  align="center"
                  gap="1"
                  className="combobox-label"
                  style={{ padding: "6px 8px" }}
                >
                  <Spinner size="1" />
                  Loading more ({branches.length})…
                </Flex>
              )}
              <Combobox.Empty>No branches found.</Combobox.Empty>

              {filtered.length > 0 && (
                <Combobox.Group
                  heading={isCloudMode ? "Remote branches" : "Local branches"}
                >
                  {filtered.map((branch) => (
                    <Combobox.Item
                      key={branch}
                      value={branch}
                      icon={<GitBranch size={11} weight="regular" />}
                    >
                      {branch}
                    </Combobox.Item>
                  ))}
                  {hasMore && (
                    <div className="combobox-label">
                      {moreCount} more {moreCount === 1 ? "branch" : "branches"}{" "}
                      — type to filter
                    </div>
                  )}
                </Combobox.Group>
              )}

              {!isCloudMode && (
                <Combobox.Footer>
                  <button
                    type="button"
                    className="combobox-footer-button"
                    onClick={() => {
                      setOpen(false);
                      actions.openBranch(
                        taskId
                          ? getSuggestedBranchName(
                              taskId,
                              repoPath ?? undefined,
                            )
                          : undefined,
                      );
                    }}
                  >
                    <Flex
                      align="center"
                      gap="2"
                      style={{ color: "var(--accent-11)" }}
                    >
                      <Plus size={11} weight="bold" />
                      <span>Create new branch</span>
                    </Flex>
                  </button>
                </Combobox.Footer>
              )}
            </>
          )}
        </Combobox.Content>
      </Combobox.Root>
    </Tooltip>
  );
}
