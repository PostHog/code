import "./message-editor.css";
import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { TourHighlight } from "@components/TourHighlight";
import { ArrowUp, Stop } from "@phosphor-icons/react";
import { InputGroup, InputGroupAddon, InputGroupButton } from "@posthog/quill";
import { Flex, Text, Tooltip } from "@radix-ui/themes";
import { EditorContent } from "@tiptap/react";
import { hasOpenOverlay } from "@utils/overlay";
import { forwardRef, useCallback, useEffect, useImperativeHandle } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useDraftStore } from "../stores/draftStore";
import { useTiptapEditor } from "../tiptap/useTiptapEditor";
import type { EditorHandle } from "../types";
import { AttachmentMenu } from "./AttachmentMenu";
import { AttachmentsBar } from "./AttachmentsBar";
import { ModeSelector } from "./ModeSelector";

export type { EditorHandle };

export interface PromptInputProps {
  sessionId: string;
  placeholder?: string;
  // editor state
  disabled?: boolean;
  isLoading?: boolean;
  autoFocus?: boolean;
  isActiveSession?: boolean;
  submitDisabledExternal?: boolean;
  clearOnSubmit?: boolean;
  // session context
  taskId?: string;
  repoPath?: string | null;
  // mode
  modeOption?: SessionConfigOption;
  onModeChange?: (value: string) => void;
  allowBypassPermissions?: boolean;
  // capabilities
  enableBashMode?: boolean;
  enableCommands?: boolean;
  // toolbar slots
  modelSelector?: React.ReactElement | null | false;
  reasoningSelector?: React.ReactElement | null | false;
  // tour hook for the send button (new-task flow)
  tourHighlightSubmit?: boolean;
  // prompt history provider
  getPromptHistory?: () => string[];
  // callbacks
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  onCancel?: () => void;
  onAttachFiles?: (files: File[]) => void;
  onEmptyChange?: (isEmpty: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  // manual submit override (for flows like new-task that submit outside the editor hook)
  onSubmitClick?: () => void;
  submitTooltipOverride?: string;
}

export const PromptInput = forwardRef<EditorHandle, PromptInputProps>(
  (
    {
      sessionId,
      placeholder = "Type a message...",
      disabled = false,
      isLoading = false,
      autoFocus = false,
      isActiveSession = true,
      submitDisabledExternal = false,
      clearOnSubmit,
      taskId,
      repoPath,
      modeOption,
      onModeChange,
      allowBypassPermissions = false,
      enableBashMode = false,
      enableCommands = true,
      modelSelector,
      reasoningSelector,
      tourHighlightSubmit = false,
      getPromptHistory,
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onCancel,
      onAttachFiles,
      onEmptyChange,
      onFocus,
      onBlur,
      onSubmitClick,
      submitTooltipOverride,
    },
    ref,
  ) => {
    const focusRequested = useDraftStore((s) => s.focusRequested[sessionId]);
    const clearFocusRequest = useDraftStore((s) => s.actions.clearFocusRequest);

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
      submitDisabled: submitDisabledExternal,
      isLoading,
      autoFocus,
      clearOnSubmit,
      context: { taskId, repoPath: repoPath ?? undefined },
      capabilities: {
        bashMode: enableBashMode,
        commands: enableCommands,
      },
      getPromptHistory,
      onSubmit,
      onBashCommand,
      onBashModeChange,
      onEmptyChange,
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

    const handleContainerClick = useCallback(
      (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (
          !target.closest("button") &&
          !target.closest('[role="menu"]') &&
          !target.closest(".ProseMirror")
        ) {
          focus();
        }
      },
      [focus],
    );

    const handleSubmitClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onSubmitClick) {
        onSubmitClick();
      } else {
        submit();
      }
    };

    const submitBlocked = submitDisabledExternal || isEmpty;
    const submitTooltip =
      submitTooltipOverride ??
      (submitBlocked ? "Enter a message" : "Send message");

    // Render send/stop button (wrapped in TourHighlight when requested)
    const submitButton =
      isLoading && onCancel ? (
        <Tooltip content="Stop">
          <InputGroupButton
            variant="destructive"
            size="icon-sm"
            className="ml-auto"
            onClick={onCancel}
            aria-label="Stop"
          >
            <Stop size={14} weight="fill" />
          </InputGroupButton>
        </Tooltip>
      ) : (
        <Tooltip content={submitTooltip}>
          <InputGroupButton
            variant="primary"
            size="icon-sm"
            className="ml-auto"
            onClick={handleSubmitClick}
            disabled={submitBlocked}
            aria-label="Send message"
          >
            <ArrowUp size={14} weight="bold" />
          </InputGroupButton>
        </Tooltip>
      );

    const wrappedSubmit = tourHighlightSubmit ? (
      <TourHighlight active>{submitButton}</TourHighlight>
    ) : (
      submitButton
    );

    return (
      <Flex direction="column" gap="1">
        <InputGroup
          onClick={handleContainerClick}
          className={`h-auto bg-card ${isBashMode ? "ring-1 ring-blue-9" : ""}`}
          style={{ cursor: "text" }}
        >
          {attachments.length > 0 && (
            <InputGroupAddon align="block-start">
              <AttachmentsBar
                attachments={attachments}
                onRemove={removeAttachment}
              />
            </InputGroupAddon>
          )}
          <div
            className="cli-editor-scroll max-h-[200px] min-h-[50px] w-full flex-1 overflow-y-auto px-2 py-2 text-[14px]"
            style={{ position: "relative" }}
          >
            <EditorContent editor={editor} />
          </div>
          <InputGroupAddon align="block-end">
            <AttachmentMenu
              disabled={disabled}
              repoPath={repoPath}
              onAddAttachment={addAttachment}
              onAttachFiles={onAttachFiles}
              onInsertChip={insertChip}
            />
            {modeOption && onModeChange && (
              <ModeSelector
                modeOption={modeOption}
                onChange={onModeChange}
                allowBypassPermissions={allowBypassPermissions}
                disabled={disabled}
              />
            )}
            {modelSelector && <span>{modelSelector}</span>}
            {reasoningSelector && <span>{reasoningSelector}</span>}
            {isBashMode && (
              <Text
                size="1"
                className="font-mono"
                style={{ color: "var(--blue-9)" }}
              >
                ! bash
              </Text>
            )}
            {wrappedSubmit}
          </InputGroupAddon>
        </InputGroup>
      </Flex>
    );
  },
);

PromptInput.displayName = "PromptInput";
