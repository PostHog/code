import { sendPromptToAgent } from "@features/sessions/utils/sendPromptToAgent";
import { PaperPlaneTilt, X } from "@phosphor-icons/react";
import type { AnnotationSide } from "@pierre/diffs";
import { Button, IconButton } from "@radix-ui/themes";
import { useCallback, useRef } from "react";
import { buildInlineCommentPrompt } from "../utils/reviewPrompts";

interface CommentAnnotationProps {
  taskId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  side: AnnotationSide;
  onDismiss: () => void;
}

export function CommentAnnotation({
  taskId,
  filePath,
  startLine,
  endLine,
  side,
  onDismiss,
}: CommentAnnotationProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const setTextareaRef = useCallback((el: HTMLTextAreaElement | null) => {
    (
      textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>
    ).current = el;
    if (el) {
      requestAnimationFrame(() => el.focus());
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const text = textareaRef.current?.value?.trim();
    if (text) {
      onDismiss();
      sendPromptToAgent(
        taskId,
        buildInlineCommentPrompt(filePath, startLine, endLine, side, text),
      );
    }
  }, [taskId, filePath, startLine, endLine, side, onDismiss]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    },
    [handleSubmit, onDismiss],
  );

  return (
    <div className="px-3 py-1.5">
      <div
        data-comment-annotation=""
        className="whitespace-normal rounded-md border border-[var(--gray-5)] bg-[var(--gray-2)] px-2.5 py-2 font-sans"
      >
        <textarea
          ref={setTextareaRef}
          placeholder="Describe the changes you'd like..."
          onKeyDown={handleKeyDown}
          className="w-full resize-none rounded border border-[var(--gray-6)] bg-[var(--color-background)] p-1.5 text-[13px] text-[var(--gray-12)] leading-normal outline-none"
          style={{ minHeight: 48 }}
        />
        <div className="mt-1.5 flex items-center gap-3">
          <Button size="1" onClick={handleSubmit}>
            <PaperPlaneTilt size={12} weight="fill" />
            Send to agent
          </Button>
          <IconButton size="1" variant="ghost" color="gray" onClick={onDismiss}>
            <X size={12} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
