import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Box } from "@radix-ui/themes";
import type { CSSProperties } from "react";

/** Matches MarkdownRenderer / Radix so list rows aren’t stuck at default `--font-size-1` / `Text size="1"`. */
const LIST_SUMMARY_BOX_STYLE: CSSProperties = {
  "--font-size-1": "12px",
} as CSSProperties;

const LIST_SUMMARY_INNER_CLASS =
  "line-clamp-4 overflow-hidden text-[12px] text-pretty leading-tight [&_a]:pointer-events-auto " +
  "[&_.rt-Text]:!text-[12px] [&_.rt-Text]:!leading-tight " +
  "[&_strong]:!text-[12px] [&_strong]:!leading-tight [&_em]:!text-[12px] [&_i]:!text-[12px] " +
  "[&_a]:!text-[12px] [&_a]:!leading-tight [&_code]:!text-[12px] [&_li]:!text-[12px]";

interface SignalReportSummaryMarkdownProps {
  content: string | null;
  /** Shown when `content` is null or empty after trim */
  fallback: string;
  /** List rows: clamp lines and tighter spacing. Detail: full block markdown. */
  variant: "list" | "detail";
  /** Render in italic to indicate the summary is still being written. */
  pending?: boolean;
}

/**
 * Renders signal report summary as GFM markdown (matches backend / agent output).
 */
export function SignalReportSummaryMarkdown({
  content,
  fallback,
  variant,
  pending,
}: SignalReportSummaryMarkdownProps) {
  const raw = content?.trim() ? content : fallback;

  /** List rows: only the first line (before first newline); CSS still caps visual lines. */
  const listMarkdown = raw.split(/\r?\n/)[0] ?? "";

  const italicStyle = pending ? { fontStyle: "italic" as const } : undefined;

  if (variant === "list") {
    return (
      <Box
        className="[&_.rt-Text]:!mb-0 [&_p]:!mb-0 [&_ul]:!mb-0 min-w-0 text-left [&_li]:mb-0"
        style={{
          color: "var(--gray-11)",
          ...italicStyle,
          ...LIST_SUMMARY_BOX_STYLE,
        }}
      >
        <div className={LIST_SUMMARY_INNER_CLASS}>
          <MarkdownRenderer content={listMarkdown} />
        </div>
      </Box>
    );
  }

  return (
    <Box
      className="min-w-0 text-pretty break-words [&_.rt-Text]:mb-2 [&_li]:mb-1 [&_p:last-child]:mb-0"
      style={{ color: "var(--gray-11)", ...italicStyle }}
    >
      <div className="text-[12px] leading-relaxed [&_a]:pointer-events-auto">
        <MarkdownRenderer content={raw} />
      </div>
    </Box>
  );
}
