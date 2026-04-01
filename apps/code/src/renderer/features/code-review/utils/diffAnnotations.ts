import type {
  DiffLineAnnotation,
  FileDiffMetadata,
  SelectedLineRange,
} from "@pierre/diffs";
import type { AnnotationMetadata, DiffOptions } from "../types";

export function getLastChangeLineNumber(
  hunk: FileDiffMetadata["hunks"][number],
): number {
  let lastChangeLine = hunk.additionStart;
  let offset = 0;
  for (const content of hunk.hunkContent) {
    if (content.type === "change") {
      lastChangeLine = hunk.additionStart + offset + content.additions - 1;
    }
    if (content.type === "context") offset += content.lines;
    if (content.type === "change") offset += content.additions;
  }
  return lastChangeLine;
}

export function buildHunkAnnotations(
  fileDiff: FileDiffMetadata,
): DiffLineAnnotation<AnnotationMetadata>[] {
  return fileDiff.hunks.flatMap((hunk, hunkIndex) => {
    if (hunk.additionLines === 0 && hunk.deletionLines === 0) return [];
    return [
      {
        side: "additions" as const,
        lineNumber: getLastChangeLineNumber(hunk),
        metadata: { kind: "hunk-revert" as const, hunkIndex },
      },
    ];
  });
}

export function buildCommentMergedOptions(
  options: DiffOptions | undefined,
  hasOpenComment: boolean,
  handleLineSelectionEnd: (range: SelectedLineRange | null) => void,
): DiffOptions {
  return {
    ...options,
    enableLineSelection: !hasOpenComment,
    enableGutterUtility: !hasOpenComment,
    onLineSelectionEnd: handleLineSelectionEnd,
  };
}
