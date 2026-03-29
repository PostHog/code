import { useCallback, useEffect, useRef } from "react";

interface InlineEditableTextProps {
  value: string;
  placeholder: string;
  active: boolean;
  onChange: (value: string) => void;
  onNavigateUp: () => void;
  onNavigateDown: () => void;
  onEscape: () => void;
  onSubmit: () => void;
}

export function InlineEditableText({
  value,
  placeholder,
  active,
  onChange,
  onNavigateUp,
  onNavigateDown,
  onEscape,
  onSubmit,
}: InlineEditableTextProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el && active) {
      el.focus();
    }
  }, [active]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onEscape();
      } else if (e.key === "ArrowUp") {
        const el = e.currentTarget;
        if (el.selectionStart === 0 && el.selectionEnd === 0) {
          e.preventDefault();
          onNavigateUp();
        }
      } else if (e.key === "ArrowDown") {
        const el = e.currentTarget;
        if (
          el.selectionStart === el.value.length &&
          el.selectionEnd === el.value.length
        ) {
          e.preventDefault();
          onNavigateDown();
        }
      } else if (e.key === "Tab") {
        e.preventDefault();
        onNavigateDown();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onNavigateUp, onNavigateDown, onEscape, onSubmit],
  );

  return (
    <textarea
      ref={textareaRef}
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        const el = e.target;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }}
      onKeyDown={handleKeyDown}
      onClick={(e) => e.stopPropagation()}
      rows={1}
      className="text-gray-12 placeholder:text-gray-10"
      style={{
        all: "unset",
        fontSize: "var(--font-size-1)",
        lineHeight: "var(--line-height-1)",
        fontWeight: 500,
        width: "100%",
        display: "block",
        resize: "none",
        overflow: "auto",
        maxHeight: "120px",
        wordBreak: "break-word",
        cursor: "text",
        userSelect: active ? "auto" : "none",
        pointerEvents: active ? "auto" : "none",
      }}
    />
  );
}
