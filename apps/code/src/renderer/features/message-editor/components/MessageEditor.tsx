import "./message-editor.css";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { BranchSelector } from "@features/git-interaction/components/BranchSelector";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { getUserPromptsForTask } from "@features/sessions/stores/sessionStore";
import { useConnectivity } from "@hooks/useConnectivity";
import { ArrowUp, Circle, Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { EditorContent } from "@tiptap/react";
import { hasOpenOverlay } from "@utils/overlay";
import { forwardRef, useCallback, useEffect, useImperativeHandle } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDraftStore } from "../stores/draftStore";
import { useTiptapEditor } from "../tiptap/useTiptapEditor";
import type { EditorHandle } from "../types";
import { AttachmentsBar } from "./AttachmentsBar";
import { DiffStatsIndicator } from "./DiffStatsIndicator";
import { EditorToolbar } from "./EditorToolbar";
import { ModeIndicatorInput } from "./ModeIndicatorInput";

export type { EditorHandle as MessageEditorHandle };

interface ModeAndBranchRowProps {
  modeOption?: SessionConfigOption;
  onModeChange?: () => void;
  repoPath?: string | null;
  cloudBranch?: string | null;
  cloudDiffStats?: {
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
  } | null;
  disabled?: boolean;
  isBashMode?: boolean;
  taskId?: string;
}

function ModeAndBranchRow({
  modeOption,
  onModeChange,
  repoPath,
  cloudBranch,
  cloudDiffStats,
  disabled,
  isBashMode,
  taskId,
}: ModeAndBranchRowProps) {
  const { currentBranch: gitBranch, diffStats } = useGitQueries(
    repoPath ?? undefined,
  );
  const currentBranch = cloudBranch ?? gitBranch;

  const showModeIndicator = !!onModeChange;
  const showBranchSelector = !!currentBranch;
  const effectiveDiffStats = cloudDiffStats ?? diffStats;
  const showDiffStats =
    effectiveDiffStats &&
    (effectiveDiffStats.filesChanged > 0 ||
      effectiveDiffStats.linesAdded > 0 ||
      effectiveDiffStats.linesRemoved > 0);

  if (!showModeIndicator && !showBranchSelector && !isBashMode) {
    return null;
  }

  return (
    <Flex
      align="center"
      justify="between"
      className="pr-2"
      style={{ overflow: "hidden" }}
    >
      <Flex align="center" gap="2" flexShrink="0">
        {isBashMode ? (
          <Text
            size="1"
            style={{ color: "var(--blue-9)", fontFamily: "monospace" }}
          >
            ! bash mode
          </Text>
        ) : (
          <>
            {showModeIndicator && modeOption && (
              <ModeIndicatorInput modeOption={modeOption} />
            )}
            {showModeIndicator && !modeOption && (
              <Text
                size="1"
                style={{ color: "var(--gray-8)", fontFamily: "monospace" }}
              >
                Loading...
              </Text>
            )}
          </>
        )}
      </Flex>
      <Flex align="center" gap="2" style={{ minWidth: 0, overflow: "hidden" }}>
        <DiffStatsIndicator
          repoPath={repoPath}
          overrideStats={cloudDiffStats}
        />
        {showBranchSelector && showDiffStats && (
          <Flex
            align="center"
            justify="center"
            style={{ height: 16, marginRight: -8, flexShrink: 0 }}
          >
            <Circle size={4} weight="fill" color="var(--gray-9)" />
          </Flex>
        )}
        {showBranchSelector && (
          <Flex style={{ maxWidth: 200, minWidth: 0 }}>
            <BranchSelector
              repoPath={repoPath ?? null}
              currentBranch={currentBranch}
              disabled={disabled}
              variant="ghost"
              taskId={taskId}
            />
          </Flex>
        )}
      </Flex>
    </Flex>
  );
}

interface MessageEditorProps {
  sessionId: string;
  placeholder?: string;
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  onCancel?: () => void;
  onAttachFiles?: (files: File[]) => void;
  autoFocus?: boolean;
  modeOption?: SessionConfigOption;
  onModeChange?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  isActiveSession?: boolean;
}

export const MessageEditor = forwardRef<EditorHandle, MessageEditorProps>(
  (
    {
      sessionId,
      placeholder = "Type a message... @ to mention files, ! for bash mode, / for skills",
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onCancel,
      onAttachFiles,
      autoFocus = false,
      modeOption,
      onModeChange,
      onFocus,
      onBlur,
      isActiveSession = true,
    },
    ref,
  ) => {
    const context = useDraftStore((s) => s.contexts[sessionId]);
    const focusRequested = useDraftStore((s) => s.focusRequested[sessionId]);
    const clearFocusRequest = useDraftStore((s) => s.actions.clearFocusRequest);
    const { isOnline } = useConnectivity();
    const taskId = context?.taskId;
    const disabled = context?.disabled ?? false;
    const isLoading = context?.isLoading ?? false;
    const repoPath = context?.repoPath;
    const cloudBranch = context?.cloudBranch;
    const cloudDiffStats = context?.cloudDiffStats;
    const isSubmitDisabled = disabled || !isOnline;

    const getPromptHistory = useCallback(
      () => getUserPromptsForTask(taskId),
      [taskId],
    );

    const {
      editor,
      isReady,
      isEmpty,
      isBashMode,
      submit,
      focus,
      blur,
      clear,
      getText,
      getContent,
      setContent,
      insertChip,
      attachments,
      addAttachment,
      removeAttachment,
    } = useTiptapEditor({
      sessionId,
      taskId,
      placeholder,
      disabled,
      submitDisabled: !isOnline,
      isLoading,
      autoFocus,
      context: { taskId, repoPath },
      getPromptHistory,
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onFocus,
      onBlur,
    });

    useImperativeHandle(
      ref,
      () => ({
        focus,
        blur,
        clear,
        isEmpty: () => isEmpty,
        getContent,
        getText,
        setContent,
        insertChip,
        addAttachment,
        removeAttachment,
      }),
      [
        focus,
        blur,
        clear,
        isEmpty,
        getContent,
        getText,
        setContent,
        insertChip,
        addAttachment,
        removeAttachment,
      ],
    );

    useEffect(() => {
      if (!focusRequested || !isReady) return;
      focus();
      clearFocusRequest(sessionId);
    }, [focusRequested, focus, clearFocusRequest, sessionId, isReady]);

    useHotkeys(
      "escape",
      (e) => {
        if (hasOpenOverlay()) return;
        if (!isActiveSession) return;
        if (isLoading && onCancel) {
          e.preventDefault();
          onCancel();
        }
      },
      {
        enableOnFormTags: true,
        enableOnContentEditable: true,
        enabled: isLoading && !!onCancel,
      },
      [isActiveSession, isLoading, onCancel],
    );

    const handleContainerClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("button") && !target.closest(".ProseMirror")) {
        focus();
      }
    };

    return (
      <Flex
        direction="column"
        gap="2"
        onClick={handleContainerClick}
        className={`rounded-md py-2 pr-0 pl-1.5 ${isBashMode ? "ring-1 ring-blue-9" : ""}`}
        style={{ cursor: "text" }}
      >
        <AttachmentsBar attachments={attachments} onRemove={removeAttachment} />

        <div
          className="cli-editor-scroll max-h-[200px] min-h-[50px] flex-1 overflow-y-auto text-[15px]"
          style={{ position: "relative" }}
        >
          <EditorContent editor={editor} />
        </div>

        <Flex
          justify="between"
          align="center"
          className="border-[var(--gray-a4)] border-t pt-1.5 pr-2"
        >
          <Flex gap="2" align="center">
            <EditorToolbar
              disabled={disabled}
              taskId={taskId}
              repoPath={repoPath}
              onAddAttachment={addAttachment}
              onAttachFiles={onAttachFiles}
              onInsertChip={insertChip}
            />
          </Flex>
          <Flex gap="2" align="center">
            {isLoading && onCancel ? (
              <Tooltip content="Stop">
                <IconButton
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={onCancel}
                  title="Stop"
                >
                  <Stop size={14} weight="fill" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip
                content={
                  !isOnline
                    ? "You're offline — send when reconnected"
                    : isSubmitDisabled || isEmpty
                      ? "Enter a message"
                      : "Send message"
                }
              >
                <IconButton
                  size="1"
                  variant="solid"
                  onClick={(e) => {
                    e.stopPropagation();
                    submit();
                  }}
                  disabled={isSubmitDisabled || isEmpty}
                  loading={isLoading}
                  style={{
                    backgroundColor:
                      isSubmitDisabled || isEmpty
                        ? "var(--accent-a4)"
                        : undefined,
                    color:
                      isSubmitDisabled || isEmpty
                        ? "var(--accent-8)"
                        : undefined,
                  }}
                >
                  <ArrowUp size={14} weight="bold" />
                </IconButton>
              </Tooltip>
            )}
          </Flex>
        </Flex>
        <ModeAndBranchRow
          modeOption={modeOption}
          onModeChange={onModeChange}
          repoPath={repoPath}
          cloudBranch={cloudBranch}
          cloudDiffStats={cloudDiffStats}
          disabled={disabled}
          isBashMode={isBashMode}
          taskId={taskId}
        />
      </Flex>
    );
  },
);

MessageEditor.displayName = "MessageEditor";
