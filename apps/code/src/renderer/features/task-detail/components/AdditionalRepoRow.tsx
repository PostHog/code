import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { BranchSelector } from "@features/git-interaction/components/BranchSelector";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { X } from "@phosphor-icons/react";
import { Flex } from "@radix-ui/themes";
import { type WorkspaceMode, WorkspaceModeSelect } from "./WorkspaceModeSelect";

export interface AdditionalRepoConfig {
  id: string;
  directory: string;
  mode: WorkspaceMode;
  branch: string | null;
}

interface AdditionalRepoRowProps {
  config: AdditionalRepoConfig;
  onChange: (config: AdditionalRepoConfig) => void;
  onRemove: () => void;
  disabled?: boolean;
}

export function AdditionalRepoRow({
  config,
  onChange,
  onRemove,
  disabled,
}: AdditionalRepoRowProps) {
  const { currentBranch, branchLoading, defaultBranch } = useGitQueries(
    config.directory,
  );

  return (
    <Flex gap="2" align="center" style={{ minWidth: 0, overflow: "hidden" }}>
      <FolderPicker
        value={config.directory}
        onChange={(dir) =>
          onChange({ ...config, directory: dir, branch: null })
        }
        placeholder="Add repository…"
        size="1"
      />
      <WorkspaceModeSelect
        value={config.mode}
        onChange={(mode) => onChange({ ...config, mode })}
        size="1"
        overrideModes={["worktree", "local"]}
      />
      {config.directory && (
        <BranchSelector
          repoPath={config.directory}
          currentBranch={currentBranch}
          defaultBranch={defaultBranch}
          disabled={disabled || !config.directory}
          loading={branchLoading}
          workspaceMode={config.mode}
          selectedBranch={config.branch}
          onBranchSelect={(branch) => onChange({ ...config, branch })}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
        title="Remove repository"
      >
        <X size={12} />
      </button>
    </Flex>
  );
}
