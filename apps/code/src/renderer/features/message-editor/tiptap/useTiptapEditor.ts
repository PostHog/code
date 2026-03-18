import { sessionStoreSetters } from "@features/sessions/stores/sessionStore";
import { useSettingsStore as useFeatureSettingsStore } from "@features/settings/stores/settingsStore";
import { trpcClient } from "@renderer/trpc/client";
import { toast } from "@renderer/utils/toast";
import { useSettingsStore } from "@stores/settingsStore";
import type { EditorView } from "@tiptap/pm/view";
import { useEditor } from "@tiptap/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePromptHistoryStore } from "../stores/promptHistoryStore";
import type { FileAttachment, MentionChip } from "../utils/content";
import { contentToXml, isContentEmpty } from "../utils/content";
import { getEditorExtensions } from "./extensions";
import { type DraftContext, useDraftSync } from "./useDraftSync";

export interface UseTiptapEditorOptions {
  sessionId: string;
  taskId?: string;
  placeholder?: string;
  disabled?: boolean;
  submitDisabled?: boolean;
  isLoading?: boolean;
  autoFocus?: boolean;
  context?: DraftContext;
  capabilities?: {
    fileMentions?: boolean;
    commands?: boolean;
    bashMode?: boolean;
  };
  clearOnSubmit?: boolean;
  onSubmit?: (text: string) => void;
  onBashCommand?: (command: string) => void;
  onBashModeChange?: (isBashMode: boolean) => void;
  onEmptyChange?: (isEmpty: boolean) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

const EDITOR_CLASS =
  "cli-editor min-h-[1.5em] w-full break-words border-none bg-transparent font-mono text-[12px] text-[var(--gray-12)] outline-none [overflow-wrap:break-word] [white-space:pre-wrap] [word-break:break-word]";

async function pasteTextAsFile(
  view: EditorView,
  text: string,
  pasteCountRef: React.MutableRefObject<number>,
): Promise<void> {
  const result = await trpcClient.os.saveClipboardText.mutate({ text });
  pasteCountRef.current += 1;
  const lineCount = text.split("\n").length;
  const label = `Pasted text #${pasteCountRef.current} (${lineCount} lines)`;
  const chipNode = view.state.schema.nodes.mentionChip.create({
    type: "file",
    id: result.path,
    label,
    pastedText: true,
  });
  const space = view.state.schema.text(" ");
  const { tr } = view.state;
  tr.replaceSelectionWith(chipNode).insert(tr.selection.from, space);
  view.dispatch(tr);
  view.focus();
}

function showPasteHint(message: string, description: string): void {
  const store = useFeatureSettingsStore.getState();
  const key =
    message === "Pasted as file attachment" ? "paste-as-file" : "paste-inline";
  if (!store.shouldShowHint(key)) return;
  store.recordHintShown(key);
  toast.info(message, description);
}

export function useTiptapEditor(options: UseTiptapEditorOptions) {
  const {
    sessionId,
    taskId,
    placeholder = "",
    disabled = false,
    submitDisabled = false,
    isLoading = false,
    autoFocus = false,
    context,
    capabilities = {},
    clearOnSubmit = true,
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
    onFocus,
    onBlur,
  } = options;

  const {
    fileMentions = true,
    commands = true,
    bashMode: enableBashMode = true,
  } = capabilities;

  const callbackRefs = useRef({
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
    onFocus,
    onBlur,
  });
  callbackRefs.current = {
    onSubmit,
    onBashCommand,
    onBashModeChange,
    onEmptyChange,
    onFocus,
    onBlur,
  };

  const submitDisabledRef = useRef(submitDisabled);
  submitDisabledRef.current = submitDisabled;

  const prevBashModeRef = useRef(false);
  const prevIsEmptyRef = useRef(true);
  const submitRef = useRef<() => void>(() => {});
  const draftRef = useRef<ReturnType<typeof useDraftSync> | null>(null);

  const pasteCountRef = useRef(0);
  const historyActions = usePromptHistoryStore.getState();
  const [isEmptyState, setIsEmptyState] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const attachmentsRef = useRef<FileAttachment[]>([]);

  const editor = useEditor(
    {
      extensions: getEditorExtensions({
        sessionId,
        placeholder,
        fileMentions,
        commands,
      }),
      editable: !disabled,
      autofocus: autoFocus ? "end" : false,
      editorProps: {
        attributes: { class: EDITOR_CLASS, spellcheck: "false" },
        handleDOMEvents: {
          click: (_view, event) => {
            const target = (event.target as HTMLElement).closest("a");
            if (target) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        },
        handleKeyDown: (view, event) => {
          if (
            event.key === "v" &&
            (event.metaKey || event.ctrlKey) &&
            event.shiftKey
          ) {
            event.preventDefault();
            (async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (!text?.trim()) return;
                useFeatureSettingsStore
                  .getState()
                  .markHintLearned("paste-inline");
                await pasteTextAsFile(view, text, pasteCountRef);
              } catch (_error) {
                toast.error("Failed to paste as file attachment");
              }
            })();
            return true;
          }

          if (event.key === "Enter") {
            const sendMessagesWith =
              useSettingsStore.getState().sendMessagesWith;
            const isCmdEnterMode = sendMessagesWith === "cmd+enter";
            const isSubmitKey = isCmdEnterMode
              ? event.metaKey || event.ctrlKey
              : !event.shiftKey;

            if (isSubmitKey) {
              if (!view.editable || submitDisabledRef.current) return false;
              const suggestionPopup =
                document.querySelector("[data-tippy-root]");
              if (suggestionPopup) return false;
              event.preventDefault();
              historyActions.reset();
              submitRef.current();
              return true;
            }
          }

          if (
            taskId &&
            (event.key === "ArrowUp" || event.key === "ArrowDown")
          ) {
            const currentText = view.state.doc.textContent;
            const isEmpty = !currentText.trim();
            const { from } = view.state.selection;
            const isAtStart = from === 1;
            const isAtEnd = from === view.state.doc.content.size - 1;

            const forceNavigate = event.shiftKey;

            if (
              event.key === "ArrowUp" &&
              (forceNavigate || isEmpty || isAtStart)
            ) {
              const queuedContent =
                sessionStoreSetters.dequeueMessagesAsText(taskId);
              if (queuedContent !== null && queuedContent !== undefined) {
                event.preventDefault();
                view.dispatch(
                  view.state.tr
                    .delete(1, view.state.doc.content.size - 1)
                    .insertText(queuedContent, 1),
                );
                return true;
              }

              const newText = historyActions.navigateUp(taskId, currentText);
              if (newText !== null) {
                event.preventDefault();
                view.dispatch(
                  view.state.tr
                    .delete(1, view.state.doc.content.size - 1)
                    .insertText(newText, 1),
                );
                return true;
              }
            }

            if (
              event.key === "ArrowDown" &&
              (forceNavigate || isEmpty || isAtEnd)
            ) {
              const newText = historyActions.navigateDown(taskId);
              if (newText !== null) {
                event.preventDefault();
                view.dispatch(
                  view.state.tr
                    .delete(1, view.state.doc.content.size - 1)
                    .insertText(newText, 1),
                );
                return true;
              }
            }
          }

          return false;
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (moved) return false;

          const files = event.dataTransfer?.files;
          if (!files || files.length === 0) return false;

          const newAttachments: FileAttachment[] = [];
          for (let i = 0; i < files.length; i++) {
            const file = files[i];
            // In Electron, File objects have a 'path' property
            const path = (file as unknown as { path?: string }).path;
            if (path) {
              newAttachments.push({ id: path, label: file.name });
            }
          }

          if (newAttachments.length > 0) {
            event.preventDefault();
            setAttachments((prev) => {
              const existing = new Set(prev.map((a) => a.id));
              const unique = newAttachments.filter((a) => !existing.has(a.id));
              return unique.length > 0 ? [...prev, ...unique] : prev;
            });
            return true;
          }

          return false;
        },
        handlePaste: (view, event) => {
          // Auto-wrap selected text as markdown link when pasting a URL
          const { from, to } = view.state.selection;
          if (from !== to) {
            const pastedUrl = event.clipboardData
              ?.getData("text/plain")
              ?.trim();
            if (pastedUrl && /^https?:\/\/\S+$/.test(pastedUrl)) {
              event.preventDefault();
              const selectedText = view.state.doc.textBetween(from, to);
              const linkMarkdown = `[${selectedText}](${pastedUrl})`;
              view.dispatch(
                view.state.tr.replaceWith(
                  from,
                  to,
                  view.state.schema.text(linkMarkdown),
                ),
              );
              return true;
            }
          }

          const items = event.clipboardData?.items;
          if (!items) return false;

          const imageItems: DataTransferItem[] = [];
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.type.startsWith("image/")) {
              imageItems.push(item);
            }
          }

          if (imageItems.length > 0) {
            event.preventDefault();

            (async () => {
              for (const item of imageItems) {
                const file = item.getAsFile();
                if (!file) continue;

                try {
                  const arrayBuffer = await file.arrayBuffer();
                  const base64 = btoa(
                    new Uint8Array(arrayBuffer).reduce(
                      (data, byte) => data + String.fromCharCode(byte),
                      "",
                    ),
                  );

                  const result = await trpcClient.os.saveClipboardImage.mutate({
                    base64Data: base64,
                    mimeType: file.type,
                    originalName: file.name,
                  });

                  setAttachments((prev) => {
                    if (prev.some((a) => a.id === result.path)) return prev;
                    return [...prev, { id: result.path, label: result.name }];
                  });
                } catch (_error) {
                  toast.error("Failed to paste image");
                }
              }
            })();

            return true;
          }

          // Auto-convert long pasted text into a file attachment
          const pastedText = event.clipboardData?.getData("text/plain");
          const autoConvertThreshold =
            useFeatureSettingsStore.getState().autoConvertLongText;
          if (
            pastedText &&
            autoConvertThreshold !== "off" &&
            pastedText.length > Number(autoConvertThreshold)
          ) {
            event.preventDefault();

            (async () => {
              try {
                await pasteTextAsFile(view, pastedText, pasteCountRef);
                showPasteHint(
                  "Pasted as file attachment",
                  "Click the chip to convert back to text.",
                );
              } catch (_error) {
                toast.error("Failed to convert pasted text to attachment");
              }
            })();

            return true;
          }

          if (pastedText && pastedText.length > 200) {
            showPasteHint(
              "Pasted as text",
              "Use ⌘⇧V to paste as a file attachment instead.",
            );
          }

          return false;
        },
      },
      onCreate: () => {
        setIsReady(true);
        const content = draftRef.current?.getContent();
        const newIsEmpty = isContentEmpty(content ?? null);
        setIsEmptyState(newIsEmpty);
        prevIsEmptyRef.current = newIsEmpty;
        callbackRefs.current.onEmptyChange?.(newIsEmpty);
      },
      onUpdate: ({ editor: e }) => {
        const text = e.getText();
        const newBashMode = enableBashMode && text.trimStart().startsWith("!");

        if (newBashMode !== prevBashModeRef.current) {
          prevBashModeRef.current = newBashMode;
          callbackRefs.current.onBashModeChange?.(newBashMode);
        }

        draftRef.current?.saveDraft(e, attachmentsRef.current);
        const content = draftRef.current?.getContent(attachmentsRef.current);
        const newIsEmpty = isContentEmpty(content ?? null);
        setIsEmptyState(newIsEmpty);

        if (newIsEmpty !== prevIsEmptyRef.current) {
          prevIsEmptyRef.current = newIsEmpty;
          callbackRefs.current.onEmptyChange?.(newIsEmpty);
        }

        e.commands.scrollIntoView();
      },
      onFocus: () => {
        callbackRefs.current.onFocus?.();
      },
      onBlur: () => {
        callbackRefs.current.onBlur?.();
      },
    },
    [sessionId, disabled, fileMentions, commands, placeholder],
  );

  const draft = useDraftSync(editor, sessionId, context);
  draftRef.current = draft;

  // Keep attachmentsRef in sync with state (synchronous, no effect needed)
  attachmentsRef.current = attachments;

  // Re-save draft when attachments change so persistence stays up to date
  useEffect(() => {
    if (editor) {
      draftRef.current?.saveDraft(editor, attachments);
    }
  }, [attachments, editor]);

  // Restore attachments from draft on mount
  useEffect(() => {
    if (draft.restoredAttachments.length > 0) {
      setAttachments(draft.restoredAttachments);
    }
    // Only run on mount / session change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.restoredAttachments]);

  const submit = useCallback(() => {
    if (!editor) return;
    if (disabled || submitDisabled) return;

    const content = draft.getContent(attachments);
    if (isContentEmpty(content)) return;

    const text = editor.getText().trim();

    if (text.startsWith("!")) {
      // Bash mode requires immediate execution, can't be queued
      if (isLoading) {
        toast.error("Cannot run shell commands while agent is generating");
        return;
      }
      const command = text.slice(1).trim();
      if (command) callbackRefs.current.onBashCommand?.(command);
    } else {
      // Normal prompts can be queued when loading
      callbackRefs.current.onSubmit?.(contentToXml(content));
    }

    if (clearOnSubmit) {
      editor.commands.clearContent();
      prevBashModeRef.current = false;
      pasteCountRef.current = 0;
      setAttachments([]);
      draft.clearDraft();
    }
  }, [
    editor,
    disabled,
    submitDisabled,
    isLoading,
    draft,
    clearOnSubmit,
    attachments,
  ]);

  submitRef.current = submit;

  const focus = useCallback(() => {
    if (editor?.view) {
      editor.commands.focus("end");
    }
  }, [editor]);
  const blur = useCallback(() => editor?.commands.blur(), [editor]);
  const clear = useCallback(() => {
    editor?.commands.clearContent();
    prevBashModeRef.current = false;
    setAttachments([]);
    draft.clearDraft();
  }, [editor, draft]);
  const getText = useCallback(() => editor?.getText() ?? "", [editor]);
  const setContent = useCallback(
    (text: string) => {
      if (!editor) return;
      editor.commands.setContent(text);
      editor.commands.focus("end");
      draft.saveDraft(editor, attachments);
    },
    [editor, draft, attachments],
  );
  const insertChip = useCallback(
    (chip: MentionChip) => {
      if (!editor) return;
      editor.commands.insertMentionChip({
        type: chip.type,
        id: chip.id,
        label: chip.label,
        pastedText: false,
      });
      draft.saveDraft(editor, attachments);
    },
    [editor, draft, attachments],
  );

  const addAttachment = useCallback((attachment: FileAttachment) => {
    setAttachments((prev) => {
      if (prev.some((a) => a.id === attachment.id)) return prev;
      return [...prev, attachment];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const isEmpty = !editor || (isEmptyState && attachments.length === 0);
  const isBashMode =
    enableBashMode && (editor?.getText().trimStart().startsWith("!") ?? false);

  return {
    editor,
    isReady,
    isEmpty,
    isBashMode,
    submit,
    focus,
    blur,
    clear,
    getText,
    getContent: draft.getContent,
    setContent,
    insertChip,
    attachments,
    addAttachment,
    removeAttachment,
  };
}
