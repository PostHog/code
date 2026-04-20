import { TourHighlight } from "@components/TourHighlight";
import { EnvironmentSelector } from "@features/environments/components/EnvironmentSelector";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { useFolders } from "@features/folders/hooks/useFolders";
import { BranchSelector } from "@features/git-interaction/components/BranchSelector";
import { GitBranchDialog } from "@features/git-interaction/components/GitInteractionDialogs";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { useGitInteractionStore } from "@features/git-interaction/state/gitInteractionStore";
import {
  createBranch,
  getBranchNameInputState,
} from "@features/git-interaction/utils/branchCreation";
import { PromptInput } from "@features/message-editor/components/PromptInput";
import { useTaskInputHistoryStore } from "@features/message-editor/stores/taskInputHistoryStore";
import type { EditorHandle } from "@features/message-editor/types";
import { DropZoneOverlay } from "@features/sessions/components/DropZoneOverlay";
import { ReasoningLevelSelector } from "@features/sessions/components/ReasoningLevelSelector";
import { UnifiedModelSelector } from "@features/sessions/components/UnifiedModelSelector";
import { getCurrentModeFromConfigOptions } from "@features/sessions/stores/sessionStore";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useAutoFocusOnTyping } from "@hooks/useAutoFocusOnTyping";
import { useConnectivity } from "@hooks/useConnectivity";
import {
  useGithubBranches,
  useRepositoryIntegration,
} from "@hooks/useIntegrations";
import { ButtonGroup } from "@posthog/quill";
import { Flex, Text } from "@radix-ui/themes";
import { useAuthStore } from "@renderer/features/auth/stores/authStore";
import { useDraftStore } from "@renderer/features/message-editor/stores/draftStore";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useNavigationStore } from "@stores/navigationStore";
import { useQuery } from "@tanstack/react-query";
import { getFilePath } from "@utils/getFilePath";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePreviewConfig } from "../hooks/usePreviewConfig";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { type WorkspaceMode, WorkspaceModeSelect } from "./WorkspaceModeSelect";

const DOT_FILL = "var(--gray-6)";

interface TaskInputProps {
  sessionId?: string;
  onTaskCreated?: (task: import("@shared/types").Task) => void;
}

export function TaskInput({
  sessionId = "task-input",
  onTaskCreated,
}: TaskInputProps = {}) {
  const { cloudRegion } = useAuthStore();
  const trpcReact = useTRPC();
  const { view } = useNavigationStore();
  const { data: mostRecentRepo } = useQuery(
    trpcReact.folders.getMostRecentlyAccessedRepository.queryOptions(),
  );
  const {
    setLastUsedLocalWorkspaceMode,
    lastUsedWorkspaceMode,
    setLastUsedWorkspaceMode,
    lastUsedAdapter,
    setLastUsedAdapter,
    lastUsedCloudRepository,
    setLastUsedCloudRepository,
    allowBypassPermissions,
    setLastUsedEnvironment,
    getLastUsedEnvironment,
    defaultInitialTaskMode,
    lastUsedInitialTaskMode,
  } = useSettingsStore();

  const editorRef = useRef<EditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonGroupRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isCreatingBranch, setIsCreatingBranch] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedEnvironment, setSelectedEnvironmentRaw] = useState<
    string | null
  >(null);
  const [selectedCloudEnvId, setSelectedCloudEnvId] = useState<string | null>(
    null,
  );

  const [selectedDirectory, setSelectedDirectory] = useState("");
  const workspaceMode = lastUsedWorkspaceMode || "local";
  const adapter = lastUsedAdapter;

  useEffect(() => {
    if (!selectedDirectory && mostRecentRepo?.path) {
      setSelectedDirectory(mostRecentRepo.path);
    }
  }, [mostRecentRepo?.path, selectedDirectory]);

  const setWorkspaceMode = (mode: WorkspaceMode) => {
    setLastUsedWorkspaceMode(mode);
    if (mode !== "cloud") {
      setLastUsedLocalWorkspaceMode(mode);
    }
  };
  const setAdapter = (newAdapter: AgentAdapter) =>
    setLastUsedAdapter(newAdapter);

  const { repositories, getIntegrationIdForRepo, isLoadingRepos } =
    useRepositoryIntegration();
  const [selectedRepository, setSelectedRepository] = useState<string | null>(
    () => lastUsedCloudRepository?.toLowerCase() ?? null,
  );
  const selectedCloudRepository = useMemo(() => {
    if (!selectedRepository) return null;
    const lower = selectedRepository.toLowerCase();
    return repositories.includes(lower) ? lower : null;
  }, [selectedRepository, repositories]);
  const { currentBranch, branchLoading, defaultBranch } =
    useGitQueries(selectedDirectory);

  const selectedIntegrationId = selectedCloudRepository
    ? getIntegrationIdForRepo(selectedCloudRepository)
    : undefined;

  const {
    data: cloudBranchData,
    isPending: cloudBranchesLoading,
    isFetchingMore: cloudBranchesFetchingMore,
    pauseLoadingMore: pauseCloudBranchesLoading,
    resumeLoadingMore: resumeCloudBranchesLoading,
  } = useGithubBranches(selectedIntegrationId, selectedCloudRepository);
  const cloudBranches = cloudBranchData?.branches;
  const cloudDefaultBranch = cloudBranchData?.defaultBranch ?? null;

  const {
    branchOpen,
    branchName: newBranchName,
    branchError,
    actions: gitActions,
  } = useGitInteractionStore();

  const handleNewBranchNameChange = useCallback(
    (value: string) => {
      const { sanitized, error } = getBranchNameInputState(value);
      gitActions.setBranchName(sanitized);
      gitActions.setBranchError(error);
    },
    [gitActions],
  );

  const handleCreateBranch = useCallback(async () => {
    setIsCreatingBranch(true);

    try {
      const result = await createBranch({
        repoPath: selectedDirectory || undefined,
        rawBranchName: newBranchName,
      });
      if (!result.success) {
        gitActions.setBranchError(result.error);
        return;
      }

      setSelectedBranch(result.branchName);
      gitActions.closeBranch();
    } finally {
      setIsCreatingBranch(false);
    }
  }, [selectedDirectory, newBranchName, gitActions]);

  const handleRepositorySelect = useCallback(
    (repo: string) => {
      const normalizedRepo = repo.toLowerCase();
      setSelectedRepository(normalizedRepo);
      setLastUsedCloudRepository(normalizedRepo);
    },
    [setLastUsedCloudRepository],
  );

  const {
    modeOption,
    modelOption,
    thoughtOption,
    isLoading: isPreviewLoading,
    setConfigOption,
  } = usePreviewConfig(adapter);

  const { folders } = useFolders();

  useEffect(() => {
    if (selectedRepository || !lastUsedCloudRepository) {
      return;
    }

    setSelectedRepository(lastUsedCloudRepository.toLowerCase());
  }, [lastUsedCloudRepository, selectedRepository]);

  useEffect(() => {
    if (isLoadingRepos || !selectedRepository || selectedCloudRepository) {
      return;
    }

    setSelectedRepository(null);
    if (lastUsedCloudRepository === selectedRepository) {
      setLastUsedCloudRepository(null);
    }
  }, [
    isLoadingRepos,
    lastUsedCloudRepository,
    selectedCloudRepository,
    selectedRepository,
    setLastUsedCloudRepository,
  ]);

  useEffect(() => {
    if (view.folderId) {
      const folder = folders.find((f) => f.id === view.folderId);
      if (folder) {
        setSelectedDirectory(folder.path);
      }
    }
  }, [view.folderId, folders]);

  const effectiveRepoPath =
    workspaceMode === "cloud" ? selectedCloudRepository : selectedDirectory;

  const setSelectedEnvironment = useCallback(
    (envId: string | null) => {
      setSelectedEnvironmentRaw(envId);
      if (effectiveRepoPath) {
        setLastUsedEnvironment(effectiveRepoPath, envId);
      }
    },
    [effectiveRepoPath, setLastUsedEnvironment],
  );

  useEffect(() => {
    setSelectedBranch(null);

    if (effectiveRepoPath) {
      setSelectedEnvironmentRaw(getLastUsedEnvironment(effectiveRepoPath));
    } else {
      setSelectedEnvironmentRaw(null);
    }
  }, [effectiveRepoPath, getLastUsedEnvironment]);

  const effectiveWorkspaceMode = workspaceMode;

  // Get current values from preview config options for task creation.
  // Defaults ensure values are always passed even before the preview config loads.
  const currentModel =
    modelOption?.type === "select" ? modelOption.currentValue : undefined;
  const adapterDefault = adapter === "codex" ? "auto" : "plan";
  const modeFallback =
    defaultInitialTaskMode === "last_used"
      ? (lastUsedInitialTaskMode ?? adapterDefault)
      : adapterDefault;
  const currentExecutionMode =
    getCurrentModeFromConfigOptions(modeOption ? [modeOption] : undefined) ??
    modeFallback;
  const currentReasoningLevel =
    thoughtOption?.type === "select" ? thoughtOption.currentValue : undefined;

  const branchForTaskCreation =
    effectiveWorkspaceMode === "worktree" || effectiveWorkspaceMode === "cloud"
      ? selectedBranch
      : null;

  const { isCreatingTask, canSubmit, handleSubmit } = useTaskCreation({
    editorRef,
    selectedDirectory,
    selectedRepository: selectedCloudRepository,
    githubIntegrationId: selectedIntegrationId,
    workspaceMode: effectiveWorkspaceMode,
    branch: branchForTaskCreation,
    editorIsEmpty,
    adapter,
    executionMode: currentExecutionMode,
    model: currentModel,
    reasoningLevel: currentReasoningLevel,
    onTaskCreated,
    environmentId: selectedEnvironment,
    sandboxEnvironmentId:
      effectiveWorkspaceMode === "cloud" && selectedCloudEnvId
        ? selectedCloudEnvId
        : undefined,
  });

  const handleModeChange = useCallback(
    (value: string) => {
      if (modeOption) {
        setConfigOption(modeOption.id, value);
      }
    },
    [modeOption, setConfigOption],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      if (modelOption) {
        setConfigOption(modelOption.id, value);
      }
    },
    [modelOption, setConfigOption],
  );

  const handleThoughtChange = useCallback(
    (value: string) => {
      if (thoughtOption) {
        setConfigOption(thoughtOption.id, value);
      }
    },
    [thoughtOption, setConfigOption],
  );

  const { isOnline } = useConnectivity();
  const promptSessionId = sessionId;

  // Populate command list for @ file mentions + / skills on mount
  useEffect(() => {
    let cancelled = false;
    trpcClient.skills.list.query().then((skills) => {
      if (cancelled) return;
      useDraftStore.getState().actions.setCommands(
        promptSessionId,
        skills.map((s) => ({ name: s.name, description: s.description })),
      );
    });
    return () => {
      cancelled = true;
      useDraftStore.getState().actions.clearCommands(promptSessionId);
    };
  }, [promptSessionId]);

  const hasHistory = useTaskInputHistoryStore((s) => s.prompts.length > 0);
  const getPromptHistory = useCallback(
    () => useTaskInputHistoryStore.getState().prompts,
    [],
  );
  const hints = [
    "@ to add files",
    "/ for skills",
    hasHistory ? "\u2191\u2193 for history" : "",
  ]
    .filter(Boolean)
    .join(", ");

  useAutoFocusOnTyping(editorRef, isCreatingTask);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);

    // If dropped on the editor, Tiptap's handleDrop already handled it
    if ((e.target as HTMLElement).closest(".ProseMirror")) return;

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = getFilePath(file);
      if (filePath) {
        editorRef.current?.addAttachment({
          id: filePath,
          label: file.name,
        });
      }
    }

    editorRef.current?.focus();
  }, []);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop container
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
      }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <DropZoneOverlay isVisible={isDraggingFile} />
      <Flex
        align="center"
        justify="center"
        height="100%"
        style={{ position: "relative" }}
      >
        <svg
          aria-hidden="true"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "100.333%",
            pointerEvents: "none",
            opacity: 0.4,
            maskImage: "linear-gradient(to top, black 0%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, black 0%, transparent 100%)",
          }}
        >
          <defs>
            <pattern
              id="dot-pattern"
              patternUnits="userSpaceOnUse"
              width="8"
              height="8"
            >
              <circle cx="0" cy="0" r="1" fill={DOT_FILL} />
              <circle cx="0" cy="8" r="1" fill={DOT_FILL} />
              <circle cx="8" cy="8" r="1" fill={DOT_FILL} />
              <circle cx="8" cy="0" r="1" fill={DOT_FILL} />
              <circle cx="4" cy="4" r="1" fill={DOT_FILL} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dot-pattern)" />
        </svg>
        <Flex
          direction="column"
          gap="2"
          style={{
            width: "100%",
            maxWidth: "600px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Flex gap="2" align="center" style={{ minWidth: 0 }}>
            <WorkspaceModeSelect
              value={workspaceMode}
              onChange={setWorkspaceMode}
              selectedCloudEnvironmentId={selectedCloudEnvId}
              onCloudEnvironmentChange={setSelectedCloudEnvId}
              size="1"
            />
            {workspaceMode === "worktree" && (
              <EnvironmentSelector
                repoPath={effectiveRepoPath ?? null}
                value={selectedEnvironment}
                onChange={setSelectedEnvironment}
                disabled={isCreatingTask}
              />
            )}
            <ButtonGroup ref={buttonGroupRef}>
              {workspaceMode === "cloud" ? (
                <GitHubRepoPicker
                  value={selectedRepository}
                  onChange={handleRepositorySelect}
                  repositories={repositories}
                  isLoading={isLoadingRepos}
                  placeholder="Select repository..."
                  size="1"
                  disabled={isCreatingTask}
                  anchor={buttonGroupRef}
                />
              ) : (
                <FolderPicker
                  value={selectedDirectory}
                  onChange={setSelectedDirectory}
                  placeholder="Select repository..."
                  size="1"
                  anchor={buttonGroupRef}
                />
              )}
              <BranchSelector
                repoPath={
                  workspaceMode === "cloud"
                    ? selectedCloudRepository
                    : selectedDirectory
                }
                currentBranch={currentBranch}
                defaultBranch={
                  workspaceMode === "cloud" ? cloudDefaultBranch : defaultBranch
                }
                disabled={
                  isCreatingTask ||
                  (workspaceMode === "cloud" && !selectedCloudRepository)
                }
                loading={branchLoading}
                workspaceMode={workspaceMode}
                selectedBranch={selectedBranch}
                onBranchSelect={setSelectedBranch}
                cloudBranches={cloudBranches}
                cloudBranchesLoading={cloudBranchesLoading}
                cloudBranchesFetchingMore={cloudBranchesFetchingMore}
                onCloudPickerOpen={resumeCloudBranchesLoading}
                onCloudBranchCommit={pauseCloudBranchesLoading}
                anchor={buttonGroupRef}
              />
            </ButtonGroup>
            {cloudRegion === "dev" && (
              <Flex align="center" gap="1" className="shrink-0">
                <span
                  className="inline-block h-2 w-2 rounded-full bg-orange-9"
                  aria-hidden
                />
                <Text size="1" color="orange" weight="medium">
                  Dev
                </Text>
              </Flex>
            )}
          </Flex>

          <PromptInput
            ref={editorRef}
            sessionId={promptSessionId}
            placeholder={`What do you want to ship? ${hints}`}
            disabled={isCreatingTask}
            isLoading={isCreatingTask}
            autoFocus
            clearOnSubmit={false}
            submitDisabledExternal={!canSubmit || isCreatingTask || !isOnline}
            repoPath={selectedDirectory}
            modeOption={modeOption}
            onModeChange={handleModeChange}
            allowBypassPermissions={allowBypassPermissions}
            enableCommands
            enableBashMode={false}
            modelSelector={
              <TourHighlight active={false} opaque>
                <UnifiedModelSelector
                  modelOption={modelOption}
                  adapter={adapter ?? "claude"}
                  onAdapterChange={setAdapter}
                  disabled={isCreatingTask}
                  isConnecting={isPreviewLoading}
                  onModelChange={handleModelChange}
                />
              </TourHighlight>
            }
            reasoningSelector={
              !isPreviewLoading && (
                <ReasoningLevelSelector
                  thoughtOption={thoughtOption}
                  adapter={adapter}
                  onChange={handleThoughtChange}
                  disabled={isCreatingTask}
                />
              )
            }
            getPromptHistory={getPromptHistory}
            onEmptyChange={setEditorIsEmpty}
            onSubmitClick={handleSubmit}
            onSubmit={() => {
              if (canSubmit) handleSubmit();
            }}
          />
        </Flex>
      </Flex>

      <GitBranchDialog
        open={branchOpen}
        onOpenChange={(open) => {
          if (!open) gitActions.closeBranch();
        }}
        branchName={newBranchName}
        onBranchNameChange={handleNewBranchNameChange}
        onConfirm={handleCreateBranch}
        isSubmitting={isCreatingBranch}
        error={branchError}
      />
    </div>
  );
}
