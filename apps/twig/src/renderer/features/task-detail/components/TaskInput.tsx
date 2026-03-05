import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
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
import { Flex } from "@radix-ui/themes";
import { useRegisteredFoldersStore } from "@renderer/stores/registeredFoldersStore";
import { repositoryWorkspaceStore } from "@renderer/stores/repositoryWorkspaceStore";
import { trpcReact } from "@renderer/trpc/client";
import { useNavigationStore } from "@stores/navigationStore";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { usePreviewSession } from "../hooks/usePreviewSession";
import { useTaskCreation } from "../hooks/useTaskCreation";
import { TaskInputEditor } from "./TaskInputEditor";
import { type WorkspaceMode, WorkspaceModeSelect } from "./WorkspaceModeSelect";

const DOT_FILL = "var(--gray-6)";

export function TaskInput() {
  const { view } = useNavigationStore();
  const { data: mostRecentRepo } =
    trpcReact.folders.getMostRecentlyAccessedRepository.useQuery();
  const {
    setLastUsedLocalWorkspaceMode,
    lastUsedWorkspaceMode,
    setLastUsedWorkspaceMode,
    lastUsedAdapter,
    setLastUsedAdapter,
    allowBypassPermissions,
  } = useSettingsStore();

  const editorRef = useRef<MessageEditorHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const [editorIsEmpty, setEditorIsEmpty] = useState(true);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);

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
  const selectedRepository = repositoryWorkspaceStore(
    (s: { selectedRepository: string | null }) => s.selectedRepository,
  );
  const { currentBranch, branchLoading, defaultBranch } =
    useGitQueries(selectedDirectory);

  const { data: cloudBranches, isPending: cloudBranchesLoading } =
    useGithubBranches(githubIntegration?.id, selectedRepository);

  // Preview session provides adapter-specific config options
  const {
    modeOption,
    modelOption,
    thoughtOption,
    previewTaskId,
    isConnecting,
  } = usePreviewSession(adapter);

  useEffect(() => {
    if (view.folderId) {
      const currentFolders = useRegisteredFoldersStore.getState().folders;
      const folder = currentFolders.find((f) => f.id === view.folderId);
      if (folder) {
        setSelectedDirectory(folder.path);
      }
    }
  }, [view.folderId]);

  const effectiveWorkspaceMode = workspaceMode;

  // Get current values from preview session config options for task creation.
  // Defaults ensure values are always passed even before the preview session loads.
  const currentModel = modelOption?.currentValue;
  const currentExecutionMode =
    getCurrentModeFromConfigOptions(modeOption ? [modeOption] : undefined) ??
    "plan";
  const currentReasoningLevel = thoughtOption?.currentValue;

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
            fontFamily: "monospace",
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
                onChange={(repo) =>
                  repositoryWorkspaceStore.getState().selectRepository(repo)
                }
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
              size="1"
            />
            <BranchSelector
              repoPath={
                workspaceMode === "cloud"
                  ? selectedRepository
                  : selectedDirectory
              }
              currentBranch={currentBranch}
              defaultBranch={defaultBranch}
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
