import { ArrowDown, ArrowUp, X } from "@phosphor-icons/react";
import { IconButton } from "@radix-ui/themes";
import { useCallback, useEffect, useRef } from "react";

interface ConversationSearchBarProps {
  query: string;
  currentMatch: number;
  totalMatches: number;
  onQueryChange: (query: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function ConversationSearchBar({
  query,
  currentMatch,
  totalMatches,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}: ConversationSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        if (e.shiftKey) {
          onPrev();
        } else {
          onNext();
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onPrev();
      }
    },
    [onClose, onNext, onPrev],
  );

  return (
    <div className="absolute top-2 right-6 z-30 flex items-center gap-1 rounded-lg border border-(--gray-6) bg-(--color-background) px-2 py-1 shadow-md">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in conversation..."
        className="w-48 border-none bg-transparent text-(--gray-12) text-[13px] outline-none placeholder:text-(--gray-9)"
      />
      {query && (
        <span className="shrink-0 text-(--gray-10) text-[12px]">
          {totalMatches > 0
            ? `${currentMatch + 1} of ${totalMatches}`
            : "No results"}
        </span>
      )}
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={onPrev}
        disabled={totalMatches === 0}
        aria-label="Previous match"
      >
        <ArrowUp size={14} />
      </IconButton>
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={onNext}
        disabled={totalMatches === 0}
        aria-label="Next match"
      >
        <ArrowDown size={14} />
      </IconButton>
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={onClose}
        aria-label="Close search"
      >
        <X size={14} />
      </IconButton>
    </div>
  );
}
