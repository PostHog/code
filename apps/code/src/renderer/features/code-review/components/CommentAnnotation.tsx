import { useCallback, useRef } from "react";

interface CommentAnnotationProps {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function CommentAnnotation({
  onSubmit,
  onCancel,
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
      onSubmit(text);
    }
  }, [onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  return (
    <div
      data-comment-annotation=""
      className="whitespace-normal rounded-md border border-[var(--gray-5)] bg-[var(--gray-2)] px-2 py-2.5"
    >
      <textarea
        ref={setTextareaRef}
        placeholder="Describe the changes you'd like..."
        onKeyDown={handleKeyDown}
        className="w-full resize-none rounded border border-[var(--gray-6)] bg-[var(--color-background)] p-1.5 font-inherit text-[13px] text-[var(--gray-12)] leading-normal outline-none"
        style={{ minHeight: 48 }}
      />
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleSubmit}
          className="cursor-pointer rounded border-none bg-[var(--accent-9)] px-2.5 py-0.5 font-medium text-[var(--gray-1)] text-xs leading-[18px]"
        >
          Send to agent
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="cursor-pointer border-none bg-transparent px-2 py-0.5 text-[var(--gray-9)] text-xs leading-[18px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
