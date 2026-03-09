import type { MessageEditorHandle } from "@features/message-editor/components/MessageEditor";
import { type RefObject, useEffect } from "react";

export function useAutoFocusOnTyping(
  editorRef: RefObject<MessageEditorHandle | null>,
  disabled = false,
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (disabled) return;

      const activeEl = document.activeElement;
      const isInInput =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT" ||
          activeEl.getAttribute("contenteditable") === "true");
      if (isInInput) return;

      if (e.key.length > 1 || e.metaKey || e.ctrlKey || e.altKey) return;

      editorRef.current?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [editorRef, disabled]);
}
