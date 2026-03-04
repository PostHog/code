import "./message-editor.css";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { BranchSelector } from "@features/git-interaction/components/BranchSelector";
import { useGitQueries } from "@features/git-interaction/hooks/useGitQueries";
import { useConnectivity } from "@hooks/useConnectivity";
import { ArrowUp, Circle, Stop } from "@phosphor-icons/react";
import { Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { EditorContent } from "@tiptap/react";
import { forwardRef, useEffect, useImperativeHandle } from "react";
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
  disabled?: boolean;
}

function ModeAndBranchRow({
  modeOption,
  onModeChange,
  repoPath,
  disabled,
}: ModeAndBranchRowProps) {
  const { currentBranch, diffStats } = useGitQueries(repoPath ?? undefined);

  const showModeIndicator = !!onModeChange;
  const showBranchSelector = !!currentBranch;
  const showDiffStats =
    diffStats &&
    (diffStats.filesChanged > 0 ||
      diffStats.linesAdded > 0 ||
      diffStats.linesRemoved > 0);

  if (!showModeIndicator && !showBranchSelector) {
    return null;
  }

  return (
    <Flex align="center" justify="between" style={{ overflow: "hidden" }}>
      <Flex align="center" gap="2" flexShrink="0">
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
      </Flex>
      <Flex align="center" gap="2" style={{ minWidth: 0, overflow: "hidden" }}>
        <DiffStatsIndicator repoPath={repoPath} />
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
    const isSubmitDisabled = disabled || !isOnline;

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
        if (isLoading && onCancel) {
          e.preventDefault();
          onCancel();
        }
      },
      {
        enableOnFormTags: true,
        enableOnContentEditable: true,
      },
      [isLoading, onCancel],
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
        style={{ cursor: "text" }}
      >
        <AttachmentsBar attachments={attachments} onRemove={removeAttachment} />

        <div className="max-h-[200px] min-h-[50px] flex-1 overflow-y-auto font-mono text-sm">
          <EditorContent editor={editor} />
        </div>

        <Flex justify="between" align="center">
          <Flex gap="2" align="center">
            <EditorToolbar
              disabled={disabled}
              taskId={taskId}
              onAddAttachment={addAttachment}
              onAttachFiles={onAttachFiles}
            />
            {isBashMode && (
              <Text size="1" className="font-mono text-accent-11">
                bash mode
              </Text>
            )}
          </Flex>
          <Flex gap="4" align="center">
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
          disabled={disabled}
        />
      </Flex>
    );
  },
);

MessageEditor.displayName = "MessageEditor";
