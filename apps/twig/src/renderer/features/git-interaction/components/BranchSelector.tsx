import { Combobox } from "@components/ui/combobox/Combobox";
import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import { GitBranch, Plus } from "@phosphor-icons/react";
import { Flex, Spinner } from "@radix-ui/themes";
import { trpcVanilla } from "@renderer/trpc";
import { toast } from "@renderer/utils/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface BranchSelectorProps {
  repoPath: string | null;
  currentBranch: string | null;
  defaultBranch?: string | null;
  disabled?: boolean;
  loading?: boolean;
  variant?: "outline" | "ghost";
  workspaceMode?: "worktree" | "local";
  selectedBranch?: string | null;
  onBranchSelect?: (branch: string | null) => void;
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
}: BranchSelectorProps) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const { actions } = useGitInteractionStore();

  const isWorktreeMode = workspaceMode === "worktree";
  const displayedBranch = isWorktreeMode ? selectedBranch : currentBranch;

  useEffect(() => {
    if (isWorktreeMode && defaultBranch && !selectedBranch && onBranchSelect) {
      onBranchSelect(defaultBranch);
    }
  }, [isWorktreeMode, defaultBranch, selectedBranch, onBranchSelect]);

  const { data: branches = [] } = useQuery({
    queryKey: ["git-all-branches", repoPath],
    queryFn: () =>
      trpcVanilla.git.getAllBranches.query({
        directoryPath: repoPath as string,
      }),
    enabled: !!repoPath && open,
    staleTime: 10_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: (branchName: string) =>
      trpcVanilla.git.checkoutBranch.mutate({
        directoryPath: repoPath as string,
        branchName,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["git-current-branch"] });
      queryClient.invalidateQueries({ queryKey: ["git-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["git-all-branches"] });
      queryClient.invalidateQueries({ queryKey: ["changed-files-head"] });
    },
    onError: (error, branchName) => {
      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      toast.error(`Failed to checkout ${branchName}`, { description: message });
    },
  });

  const handleBranchChange = (value: string) => {
    if (isWorktreeMode) {
      onBranchSelect?.(value || null);
    } else if (value && value !== currentBranch) {
      checkoutMutation.mutate(value);
    }
    setOpen(false);
  };

  const displayText = loading ? "Loading..." : (displayedBranch ?? "No branch");

  const triggerContent = (
    <Flex align="center" gap="1" style={{ minWidth: 0 }}>
      {loading ? (
        <Spinner size="1" />
      ) : (
        <GitBranch size={16} weight="regular" style={{ flexShrink: 0 }} />
      )}
      <span className="combobox-trigger-text">{displayText}</span>
    </Flex>
  );

  const combobox = (
    <Combobox.Root
      value={displayedBranch ?? ""}
      onValueChange={handleBranchChange}
      open={open}
      onOpenChange={setOpen}
      size="1"
      disabled={disabled || !repoPath}
    >
      <Combobox.Trigger variant={variant} placeholder="No branch">
        {triggerContent}
      </Combobox.Trigger>

      <Combobox.Content>
        <Combobox.Input placeholder="Search branches" />
        <Combobox.Empty>No branches found.</Combobox.Empty>

        <Combobox.Group heading="Local branches">
          {branches.map((branch) => (
            <Combobox.Item
              key={branch}
              value={branch}
              icon={<GitBranch size={11} weight="regular" />}
            >
              {branch}
            </Combobox.Item>
          ))}
        </Combobox.Group>

        <Combobox.Footer>
          <button
            type="button"
            className="combobox-footer-button"
            onClick={() => {
              setOpen(false);
              actions.openBranch();
            }}
          >
            <Flex align="center" gap="2" style={{ color: "var(--accent-11)" }}>
              <Plus size={11} weight="bold" />
              <span>Create new branch</span>
            </Flex>
          </button>
        </Combobox.Footer>
      </Combobox.Content>
    </Combobox.Root>
  );

  return combobox;
}
