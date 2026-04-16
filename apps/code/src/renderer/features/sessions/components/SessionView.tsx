import { isOtherOption } from "@components/action-selector/constants";
import { PermissionSelector } from "@components/permissions/PermissionSelector";
import {
  PromptInput,
  type EditorHandle as PromptInputHandle,
} from "@features/message-editor/components/PromptInput";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import {
  useModeConfigOptionForTask,
  usePendingPermissionsForTask,
} from "@features/sessions/stores/sessionStore";
import type { Plan } from "@features/sessions/types";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useIsWorkspaceCloudRun } from "@features/workspace/hooks/useWorkspace";
import { useAutoFocusOnTyping } from "@hooks/useAutoFocusOnTyping";
import { Pause, Spinner, Warning } from "@phosphor-icons/react";
import { Box, Button, ContextMenu, Flex, Text } from "@radix-ui/themes";
import {
  type AcpMessage,
  isJsonRpcNotification,
  isJsonRpcResponse,
} from "@shared/types/session-events";
import { getFilePath } from "@utils/getFilePath";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSessionService } from "../service/service";
import {
  useSessionViewActions,
  useShowRawLogs,
} from "../stores/sessionViewStore";
import { ConversationView } from "./ConversationView";
import { DropZoneOverlay } from "./DropZoneOverlay";
import { ModelSelector } from "./ModelSelector";
import { PlanStatusBar } from "./PlanStatusBar";
import { RawLogsView } from "./raw-logs/RawLogsView";

interface SessionViewProps {
  events: AcpMessage[];
  taskId?: string;
  isRunning: boolean;
  isPromptPending?: boolean | null;
  promptStartedAt?: number | null;
  onSendPrompt: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onCancelPrompt: () => void;
  repoPath?: string | null;
  cloudBranch?: string | null;
  isSuspended?: boolean;
  onRestoreWorktree?: () => void;
  isRestoring?: boolean;
  hasError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onNewSession?: () => void;
  isInitializing?: boolean;
  slackThreadUrl?: string;
  compact?: boolean;
  isActiveSession?: boolean;
  /** Hide the message input and permission UI — log-only view. */
  hideInput?: boolean;
}

const DEFAULT_ERROR_MESSAGE =
  "Failed to resume this session. The working directory may have been deleted. Please start a new session.";

export function SessionView({
  events,
  taskId,
  isRunning,
  isPromptPending = false,
  promptStartedAt,
  onSendPrompt,
  onBashCommand,
  onCancelPrompt,
  repoPath,
  cloudBranch,
  isSuspended = false,
  onRestoreWorktree,
  isRestoring = false,
  hasError = false,
  errorTitle,
  errorMessage = DEFAULT_ERROR_MESSAGE,
  onRetry,
  onNewSession,
  isInitializing = false,
  slackThreadUrl,
  compact = false,
  isActiveSession = true,
  hideInput = false,
}: SessionViewProps) {
  const showRawLogs = useShowRawLogs();
  const { setShowRawLogs } = useSessionViewActions();
  const pendingPermissions = usePendingPermissionsForTask(taskId);
  const modeOption = useModeConfigOptionForTask(taskId);
  const { allowBypassPermissions } = useSettingsStore();
  const currentModeId = modeOption?.currentValue;

  useEffect(() => {
    if (allowBypassPermissions) return;
    const isBypass =
      currentModeId === "bypassPermissions" || currentModeId === "full-access";
    if (isBypass && taskId) {
      getSessionService().setSessionConfigOptionByCategory(
        taskId,
        "mode",
        "default",
      );
    }
  }, [allowBypassPermissions, currentModeId, taskId]);

  const handleModeChange = useCallback(
    (nextMode: string) => {
      if (!taskId) return;
      getSessionService().setSessionConfigOptionByCategory(
        taskId,
        "mode",
        nextMode,
      );
    },
    [taskId],
  );

  const sessionId = taskId ?? "default";
  const setContext = useDraftStore((s) => s.actions.setContext);
  const requestFocus = useDraftStore((s) => s.actions.requestFocus);

  useEffect(() => {
    setContext(sessionId, {
      taskId,
      repoPath,
      cloudBranch,
      disabled: !isRunning,
      isLoading: !!isPromptPending,
    });
  }, [
    setContext,
    sessionId,
    taskId,
    repoPath,
    cloudBranch,
    isRunning,
    isPromptPending,
  ]);

  const isCloudRun = useIsWorkspaceCloudRun(taskId);

  const latestPlan = useMemo((): Plan | null => {
    let planIndex = -1;
    let plan: Plan | null = null;
    let turnEndResponseIndex = -1;

    for (let i = events.length - 1; i >= 0; i--) {
      const msg = events[i].message;

      if (
        turnEndResponseIndex === -1 &&
        isJsonRpcResponse(msg) &&
        (msg.result as { stopReason?: string })?.stopReason !== undefined
      ) {
        turnEndResponseIndex = i;
      }

      if (
        planIndex === -1 &&
        isJsonRpcNotification(msg) &&
        msg.method === "session/update"
      ) {
        const update = (msg.params as { update?: { sessionUpdate?: string } })
          ?.update;
        if (update?.sessionUpdate === "plan") {
          planIndex = i;
          plan = update as Plan;
        }
      }

      if (planIndex !== -1 && turnEndResponseIndex !== -1) break;
    }

    if (turnEndResponseIndex > planIndex) return null;

    return plan;
  }, [events]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (text.trim()) {
        onSendPrompt(text);
      }
    },
    [onSendPrompt],
  );

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const editorRef = useRef<PromptInputHandle>(null);
  const dragCounterRef = useRef(0);

  const firstPendingPermission = useMemo(() => {
    const entries = Array.from(pendingPermissions.entries());
    if (entries.length === 0) return null;
    const [toolCallId, permission] = entries[0];
    return { ...permission, toolCallId };
  }, [pendingPermissions]);

  const handlePermissionSelect = useCallback(
    async (
      optionId: string,
      customInput?: string,
      answers?: Record<string, string>,
    ) => {
      if (!firstPendingPermission || !taskId) return;

      const selectedOption = firstPendingPermission.options.find(
        (o) => o.optionId === optionId,
      );
      const isModeSwitch =
        firstPendingPermission.toolCall?.kind === "switch_mode";
      if (selectedOption?.kind === "allow_always" && !isModeSwitch) {
        getSessionService().setSessionConfigOptionByCategory(
          taskId,
          "mode",
          "acceptEdits",
        );
      }

      if (customInput) {
        if (
          isOtherOption(optionId) ||
          selectedOption?._meta?.customInput === true
        ) {
          await getSessionService().respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            customInput,
            answers,
          );
        } else {
          await getSessionService().respondToPermission(
            taskId,
            firstPendingPermission.toolCallId,
            optionId,
            undefined,
            answers,
          );
          onSendPrompt(customInput);
        }
      } else {
        await getSessionService().respondToPermission(
          taskId,
          firstPendingPermission.toolCallId,
          optionId,
          undefined,
          answers,
        );
      }

      requestFocus(sessionId);
    },
    [firstPendingPermission, taskId, onSendPrompt, requestFocus, sessionId],
  );

  const handlePermissionCancel = useCallback(async () => {
    if (!firstPendingPermission || !taskId) return;
    await getSessionService().cancelPermission(
      taskId,
      firstPendingPermission.toolCallId,
    );
    await getSessionService().cancelPrompt(taskId);
    requestFocus(sessionId);
  }, [firstPendingPermission, taskId, requestFocus, sessionId]);

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

  const handlePaneClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;

    const interactiveSelector =
      'button, a, input, textarea, select, [role="button"], [role="link"], [contenteditable="true"], [data-interactive]';
    if (target.closest(interactiveSelector)) {
      return;
    }

    const selection = window.getSelection();
    if (selection && selection.toString().length > 0) {
      return;
    }

    editorRef.current?.focus();
  }, []);

  useAutoFocusOnTyping(editorRef, !isActiveSession);

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        <Flex
          direction="column"
          height="100%"
          className="relative bg-background"
          onClick={handlePaneClick}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isSuspended ? (
            <>
              {showRawLogs ? (
                <RawLogsView events={events} />
              ) : (
                <ConversationView
                  events={events}
                  isPromptPending={isPromptPending}
                  promptStartedAt={promptStartedAt}
                  repoPath={repoPath}
                  taskId={taskId}
                  slackThreadUrl={slackThreadUrl}
                />
              )}
              <Box className="border-gray-4 border-t">
                <Box className="mx-auto max-w-[750px] p-2">
                  <Flex
                    align="center"
                    justify="between"
                    gap="3"
                    py="2"
                    px="3"
                    className="rounded-2 bg-gray-3"
                  >
                    <Flex align="center" gap="2">
                      <Pause
                        size={14}
                        weight="duotone"
                        color="var(--gray-11)"
                      />
                      <Text size="1" weight="medium">
                        Worktree suspended
                      </Text>
                      <Text size="1" color="gray">
                        Worktree was removed to save disk space
                      </Text>
                    </Flex>
                    {onRestoreWorktree && (
                      <Button
                        variant="outline"
                        size="1"
                        onClick={onRestoreWorktree}
                        disabled={isRestoring}
                      >
                        {isRestoring ? (
                          <>
                            <Spinner size={14} className="animate-spin" />
                            Restoring...
                          </>
                        ) : (
                          "Restore worktree"
                        )}
                      </Button>
                    )}
                  </Flex>
                </Box>
              </Box>
            </>
          ) : isInitializing ? (
            <Flex
              align="center"
              justify="center"
              className="absolute inset-0 bg-background"
            >
              <Spinner size={32} className="animate-spin text-gray-9" />
            </Flex>
          ) : (
            <>
              <DropZoneOverlay isVisible={isDraggingFile} />
              {showRawLogs ? (
                <RawLogsView events={events} />
              ) : (
                <ConversationView
                  events={events}
                  isPromptPending={isPromptPending}
                  promptStartedAt={promptStartedAt}
                  repoPath={repoPath}
                  taskId={taskId}
                  slackThreadUrl={slackThreadUrl}
                  compact={compact}
                />
              )}

              <PlanStatusBar plan={latestPlan} />

              {hasError ? (
                <Flex
                  align="center"
                  justify="center"
                  direction="column"
                  gap="2"
                  className="absolute inset-0 bg-background"
                >
                  <Warning size={32} weight="duotone" color="var(--red-9)" />
                  {errorTitle && (
                    <Text size="3" weight="bold" align="center" color="red">
                      {errorTitle}
                    </Text>
                  )}
                  <Text
                    size={errorTitle ? "2" : "3"}
                    weight={errorTitle ? "regular" : "medium"}
                    align="center"
                    color={errorTitle ? "gray" : "red"}
                    className="max-w-md px-4"
                  >
                    {errorMessage}
                  </Text>
                  <Flex gap="2" mt="2">
                    {onRetry && (
                      <Button variant="soft" size="2" onClick={onRetry}>
                        Retry
                      </Button>
                    )}
                    {onNewSession && (
                      <Button
                        variant="soft"
                        size="2"
                        color="green"
                        onClick={onNewSession}
                      >
                        New Session
                      </Button>
                    )}
                  </Flex>
                </Flex>
              ) : hideInput ? null : firstPendingPermission ? (
                <Box className="border-gray-4 border-t">
                  <Box className="mx-auto max-w-[750px] p-2">
                    <PermissionSelector
                      toolCall={firstPendingPermission.toolCall}
                      options={firstPendingPermission.options}
                      onSelect={handlePermissionSelect}
                      onCancel={handlePermissionCancel}
                    />
                  </Box>
                </Box>
              ) : (
                <Box className="relative border-gray-4 border-t">
                  <Box
                    className={`absolute inset-0 flex items-center justify-center gap-2 transition-opacity duration-200 ${
                      isRunning
                        ? "pointer-events-none opacity-0"
                        : "opacity-100"
                    }`}
                    style={{ minHeight: 66 }}
                  >
                    <Spinner size={28} className="animate-spin text-gray-9" />
                    <Text size="3" color="gray">
                      Connecting to agent...
                    </Text>
                  </Box>
                  <Box
                    className={`transition-all duration-300 ease-out ${
                      isRunning
                        ? "translate-y-0 opacity-100"
                        : "pointer-events-none translate-y-4 opacity-0"
                    }`}
                  >
                    <Box
                      className={compact ? "p-1" : "mx-auto max-w-[750px] p-2"}
                    >
                      <PromptInput
                        ref={editorRef}
                        sessionId={sessionId}
                        placeholder="Type a message... @ to mention files, ! for bash mode, / for skills"
                        disabled={!isRunning}
                        isLoading={!!isPromptPending}
                        isActiveSession={isActiveSession}
                        taskId={taskId}
                        repoPath={repoPath}
                        modeOption={modeOption}
                        onModeChange={modeOption ? handleModeChange : undefined}
                        allowBypassPermissions={allowBypassPermissions}
                        enableBashMode={!isCloudRun}
                        modelSelector={
                          <ModelSelector
                            taskId={taskId}
                            disabled={!isRunning}
                          />
                        }
                        onSubmit={handleSubmit}
                        onBashCommand={onBashCommand}
                        onCancel={onCancelPrompt}
                      />
                    </Box>
                  </Box>
                </Box>
              )}
            </>
          )}
        </Flex>
      </ContextMenu.Trigger>
      <ContextMenu.Content size="1">
        <ContextMenu.CheckboxItem
          checked={showRawLogs}
          onCheckedChange={setShowRawLogs}
        >
          Show raw logs
        </ContextMenu.CheckboxItem>
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
