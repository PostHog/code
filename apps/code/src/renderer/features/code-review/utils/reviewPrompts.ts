import type { AnnotationSide } from "@pierre/diffs";

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildInlineCommentPrompt(
  filePath: string,
  startLine: number,
  endLine: number,
  side: AnnotationSide,
  comment: string,
): string {
  const lineRef =
    startLine === endLine
      ? `line ${startLine}`
      : `lines ${startLine}-${endLine}`;
  const sideLabel = side === "deletions" ? "old" : "new";
  const escapedPath = escapeXmlAttr(filePath);
  return `In file <file path="${escapedPath}" />, ${lineRef} (${sideLabel}):\n\n${comment}`;
}
