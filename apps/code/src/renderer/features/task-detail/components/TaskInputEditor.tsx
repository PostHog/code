import "@features/message-editor/components/message-editor.css";
import { TourHighlight } from "@components/TourHighlight";
import { AttachmentsBar } from "@features/message-editor/components/AttachmentsBar";
import { EditorToolbar } from "@features/message-editor/components/EditorToolbar";
import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { useTiptapEditor } from "@features/message-editor/tiptap/useTiptapEditor";
import { ReasoningLevelSelector } from "@features/sessions/components/ReasoningLevelSelector";
import { UnifiedModelSelector } from "@features/sessions/components/UnifiedModelSelector";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import { useConnectivity } from "@hooks/useConnectivity";
import { ArrowUp } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text, Tooltip } from "@radix-ui/themes";
import { EditorContent } from "@tiptap/react";
import { forwardRef, useImperativeHandle } from "react";
import "./TaskInput.css";

interface TaskInputEditorProps {
  sessionId: string;
  repoPath: string;
  isCreatingTask: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  hasDirectory: boolean;
  directoryTooltip?: string;
  onEmptyChange?: (isEmpty: boolean) => void;
  adapter?: "claude" | "codex";
  previewTaskId?: string;
  onAdapterChange?: (adapter: AgentAdapter) => void;
  isPreviewConnecting?: boolean;
  autoFocus?: boolean;
  tourHighlight?: "model-selector" | "submit-button" | null;
  onModelChange?: (model: string) => void;
}

export const TaskInputEditor = forwardRef<
  MessageEditorHandle,
  TaskInputEditorProps
>(
  (
    {
      sessionId,
      repoPath,
      isCreatingTask,
      canSubmit,
      onSubmit,
      hasDirectory,
      directoryTooltip = "Select a folder first",
      onEmptyChange,
      adapter,
      previewTaskId,
      onAdapterChange,
      isPreviewConnecting,
      autoFocus = true,
      tourHighlight,
      onModelChange,
    },
    ref,
  ) => {
    const { isOnline } = useConnectivity();
    const isSubmitDisabled = isCreatingTask || !isOnline;

    const {
      editor,
      isEmpty,
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
      placeholder: "What do you want to work on? - @ to add context",
      disabled: isCreatingTask,
      submitDisabled: !isOnline,
      isLoading: isCreatingTask,
      autoFocus,
      context: { repoPath },
      capabilities: { commands: false, bashMode: false },
      clearOnSubmit: false,
      onSubmit: (text) => {
        if (text && canSubmit) {
          onSubmit();
        }
      },
      onEmptyChange,
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

    const getSubmitTooltip = () => {
      if (isCreatingTask) return "Creating task...";
      if (!isOnline) return "You're offline — send when reconnected";
      if (isEmpty) return "Enter a task description";
      if (!hasDirectory) return directoryTooltip;
      if (!canSubmit) return "Missing required fields";
      return "Create task";
    };

    return (
      <Flex
        direction="column"
        style={{
          backgroundColor: "var(--gray-2)",
          borderRadius: "var(--radius-2)",
          border: "1px solid var(--gray-a6)",
          position: "relative",
          overflow: "visible",
        }}
      >
        <Flex
          direction="column"
          p="3"
          style={{
            cursor: "text",
            position: "relative",
            overflow: "visible",
            zIndex: 1,
          }}
          onClick={(e) => {
            const target = e.target as HTMLElement;
            if (!target.closest(".ProseMirror")) {
              focus();
            }
          }}
        >
          <AttachmentsBar
            attachments={attachments}
            onRemove={removeAttachment}
          />

          <Flex
            align="start"
            gap="2"
            style={{
              display: "flex",
              overflow: "visible",
              minWidth: 0,
            }}
          >
            <Text
              size="2"
              weight="bold"
              style={{
                color: "var(--accent-11)",
                fontFamily: "monospace",
                userSelect: "none",
                WebkitUserSelect: "none",
                bottom: "1px",
                position: "relative",
              }}
            >
              &gt;
            </Text>
            {isCreatingTask ? (
              <Text
                size="2"
                color="gray"
                style={{
                  fontFamily: "monospace",
                  fontSize: "var(--font-size-1)",
                }}
              >
                Creating task...
              </Text>
            ) : (
              <Box
                style={{
                  flex: 1,
                  position: "relative",
                  minWidth: 0,
                  maxHeight: "200px",
                  overflowY: "auto",
                }}
              >
                <EditorContent editor={editor} />
              </Box>
            )}
          </Flex>
        </Flex>

        <Flex justify="between" align="center" px="3" pb="3">
          <Flex align="center" gap="3">
            <EditorToolbar
              disabled={isCreatingTask}
              adapter={adapter}
              onAddAttachment={addAttachment}
              attachTooltip="Attach files from anywhere"
              iconSize={16}
              hideSelectors
            />
            <TourHighlight active={tourHighlight === "model-selector"}>
              <UnifiedModelSelector
                taskId={previewTaskId}
                adapter={adapter ?? "claude"}
                onAdapterChange={onAdapterChange ?? (() => {})}
                disabled={isCreatingTask}
                isConnecting={isPreviewConnecting}
                onModelChange={onModelChange}
              />
            </TourHighlight>
            {!isPreviewConnecting && (
              <ReasoningLevelSelector
                taskId={previewTaskId}
                disabled={isCreatingTask}
              />
            )}
          </Flex>

          <Flex align="center" gap="4">
            <TourHighlight active={tourHighlight === "submit-button"}>
              <Tooltip content={getSubmitTooltip()}>
                <IconButton
                  size="1"
                  variant="solid"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSubmit();
                  }}
                  disabled={!canSubmit || isSubmitDisabled}
                  loading={isCreatingTask}
                  style={{
                    backgroundColor:
                      !canSubmit || isSubmitDisabled
                        ? "var(--accent-a4)"
                        : undefined,
                    color:
                      !canSubmit || isSubmitDisabled
                        ? "var(--accent-8)"
                        : undefined,
                  }}
                >
                  <ArrowUp size={16} weight="bold" />
                </IconButton>
              </Tooltip>
            </TourHighlight>
          </Flex>
        </Flex>
      </Flex>
    );
  },
);

TaskInputEditor.displayName = "TaskInputEditor";
