import type { PrReviewComment } from "@main/services/git/schemas";
import type { AnnotationSide } from "@pierre/diffs";

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatThreadForPrompt(comments: PrReviewComment[]): string {
  return comments.map((c) => `@${c.user.login}:\n> ${c.body}`).join("\n\n");
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

export function buildFixPrCommentPrompt(
  filePath: string,
  line: number,
  side: "old" | "new",
  comments: PrReviewComment[],
): string {
  const escapedPath = escapeXmlAttr(filePath);
  const thread = formatThreadForPrompt(comments);
  return `Fix this PR review comment on <file path="${escapedPath}" />, line ${line} (${side}):\n\n${thread}`;
}

export function buildAskAboutPrCommentPrompt(
  filePath: string,
  line: number,
  side: "old" | "new",
  comments: PrReviewComment[],
): string {
  const escapedPath = escapeXmlAttr(filePath);
  const thread = formatThreadForPrompt(comments);
  return `Help me understand this PR review comment on <file path="${escapedPath}" />, line ${line} (${side}):\n\n${thread}\n\nWhat is this comment asking for and how should I address it? Do not make any changes, your job is simply to chat with me about this comment. If I need further changes, I'll ask.`;
}
