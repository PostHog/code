import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { Box } from "@radix-ui/themes";

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

  const italicStyle = pending ? { fontStyle: "italic" as const } : undefined;

  if (variant === "list") {
    return (
      <Box
        className="[&_.rt-Text]:!mb-0 [&_p]:!mb-0 [&_ul]:!mb-0 min-w-0 text-left [&_li]:mb-0"
        style={{ color: "var(--gray-11)", ...italicStyle }}
      >
        <div className="line-clamp-2 overflow-hidden text-[12px] leading-snug [&_a]:pointer-events-auto">
          <MarkdownRenderer content={raw} />
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
