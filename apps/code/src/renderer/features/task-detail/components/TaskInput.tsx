import { EnvironmentSelector } from "@features/environments/components/EnvironmentSelector";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import { useFolders } from "@features/folders/hooks/useFolders";
import { BranchSelector } from "@features/git-interaction/components/BranchSelector";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { ModeIndicatorInput } from "@features/message-editor/components/ModeIndicatorInput";
import { DropZoneOverlay } from "@features/sessions/components/DropZoneOverlay";
import { getSessionService } from "@features/sessions/service/service";
import {
  cycleModeOption,
  getCurrentModeFromConfigOptions,
} from "@features/sessions/stores/sessionStore";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useAutoFocusOnTyping } from "@hooks/useAutoFocusOnTyping";
import {
  useGithubBranches,
  useRepositoryIntegration,
} from "@hooks/useIntegrations";
import { Flex, Text } from "@radix-ui/themes";
import { useAuthStore } from "@renderer/features/auth/stores/authStore";
import { useTRPC } from "@renderer/trpc/client";
import { useNavigationStore } from "@stores/navigationStore";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { usePreviewSession } from "../hooks/usePreviewSession";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { TaskInputEditor } from "./TaskInputEditor";
import { type WorkspaceMode, WorkspaceModeSelect } from "./WorkspaceModeSelect";

const DOT_FILL = "var(--gray-6)";

interface TaskInputProps {
  onTaskCreated?: (task: import("@shared/types").Task) => void;
}

export function TaskInput({ onTaskCreated }: TaskInputProps = {}) {
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
    allowBypassPermissions,
    setLastUsedEnvironment,
    getLastUsedEnvironment,
    defaultInitialTaskMode,
    lastUsedInitialTaskMode,
  } = useSettingsStore();

  const editorRef = useRef<MessageEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
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

  const { githubIntegration, repositories, isLoadingRepos } =
    useRepositoryIntegration();
  const [selectedRepository, setSelectedRepository] = useState<string | null>(
    null,
  );
  const { currentBranch, branchLoading, defaultBranch } =
    useGitQueries(selectedDirectory);

  const { data: cloudBranchData, isPending: cloudBranchesLoading } =
    useGithubBranches(githubIntegration?.id, selectedRepository);
  const cloudBranches = cloudBranchData?.branches;
  const cloudDefaultBranch = cloudBranchData?.defaultBranch ?? null;

  // Preview session provides adapter-specific config options
  const {
    modeOption,
    modelOption,
    thoughtOption,
    previewTaskId,
    isConnecting,
  } = usePreviewSession(adapter);

  const { folders } = useFolders();

  useEffect(() => {
    if (view.folderId) {
      const folder = folders.find((f) => f.id === view.folderId);
      if (folder) {
        setSelectedDirectory(folder.path);
      }
    }
  }, [view.folderId, folders]);

  const effectiveRepoPath =
    workspaceMode === "cloud" ? selectedRepository : selectedDirectory;

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

  // Get current values from preview session config options for task creation.
  // Defaults ensure values are always passed even before the preview session loads.
  const currentModel =
    modelOption?.type === "select" ? modelOption.currentValue : undefined;
  const modeFallback =
    defaultInitialTaskMode === "last_used" ? lastUsedInitialTaskMode : "plan";
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
    selectedRepository,
    githubIntegrationId: githubIntegration?.id,
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

  const handleCycleMode = useCallback(() => {
    const nextValue = cycleModeOption(modeOption, allowBypassPermissions);
    if (nextValue && modeOption) {
      getSessionService().setSessionConfigOption(
        previewTaskId,
        modeOption.id,
        nextValue,
      );
    }
  }, [modeOption, allowBypassPermissions, previewTaskId]);

  // Global shift+tab to cycle mode regardless of focus
  useHotkeys(
    "shift+tab",
    (e) => {
      e.preventDefault();
      handleCycleMode();
    },
    {
      enableOnFormTags: true,
      enableOnContentEditable: true,
      enabled: !!modeOption,
    },
    [handleCycleMode, modeOption],
  );

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
      const filePath = (file as File & { path?: string }).path;
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
        overflow: "hidden",
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
          gap="4"
          style={{
            width: "100%",
            maxWidth: "600px",
            position: "relative",
            zIndex: 1,
          }}
        >
          <Flex
            gap="2"
            align="center"
            style={{ minWidth: 0, overflow: "hidden" }}
          >
            {workspaceMode === "cloud" ? (
              <GitHubRepoPicker
                value={selectedRepository}
                onChange={setSelectedRepository}
                repositories={repositories}
                isLoading={isLoadingRepos}
                placeholder="Select repository..."
                size="1"
                disabled={isCreatingTask}
              />
            ) : (
              <FolderPicker
                value={selectedDirectory}
                onChange={setSelectedDirectory}
                placeholder="Select repository..."
                size="1"
              />
            )}
            <WorkspaceModeSelect
              value={workspaceMode}
              onChange={setWorkspaceMode}
              selectedCloudEnvironmentId={selectedCloudEnvId}
              onCloudEnvironmentChange={setSelectedCloudEnvId}
              size="1"
            />
            <BranchSelector
              repoPath={
                workspaceMode === "cloud"
                  ? selectedRepository
                  : selectedDirectory
              }
              currentBranch={currentBranch}
              defaultBranch={
                workspaceMode === "cloud" ? cloudDefaultBranch : defaultBranch
              }
              disabled={
                isCreatingTask ||
                (workspaceMode === "cloud" && !selectedRepository)
              }
              loading={branchLoading}
              workspaceMode={workspaceMode}
              selectedBranch={selectedBranch}
              onBranchSelect={setSelectedBranch}
              cloudBranches={cloudBranches}
              cloudBranchesLoading={cloudBranchesLoading}
            />
            {workspaceMode === "worktree" && (
              <EnvironmentSelector
                repoPath={effectiveRepoPath ?? null}
                value={selectedEnvironment}
                onChange={setSelectedEnvironment}
                disabled={isCreatingTask}
              />
            )}
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

          <TaskInputEditor
            ref={editorRef}
            sessionId="task-input"
            repoPath={selectedDirectory}
            isCreatingTask={isCreatingTask}
            canSubmit={canSubmit}
            onSubmit={handleSubmit}
            hasDirectory={
              workspaceMode === "cloud"
                ? !!selectedRepository
                : !!selectedDirectory
            }
            directoryTooltip={
              workspaceMode === "cloud"
                ? "Select a repository first"
                : "Select a folder first"
            }
            onEmptyChange={setEditorIsEmpty}
            adapter={adapter}
            previewTaskId={previewTaskId}
            onAdapterChange={setAdapter}
            isPreviewConnecting={isConnecting}
          />

          <ModeIndicatorInput
            modeOption={modeOption}
            onCycleMode={handleCycleMode}
          />
        </Flex>
      </Flex>
    </div>
  );
}
