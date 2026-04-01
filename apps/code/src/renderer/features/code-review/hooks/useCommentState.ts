import type {
  AnnotationSide,
  DiffLineAnnotation,
  SelectedLineRange,
} from "@pierre/diffs";
import { useCallback, useState } from "react";
import type { AnnotationMetadata } from "../types";

export function useCommentState() {
  const [selectedRange, setSelectedRange] = useState<SelectedLineRange | null>(
    null,
  );
  const [commentAnnotation, setCommentAnnotation] =
    useState<DiffLineAnnotation<AnnotationMetadata> | null>(null);

  const hasOpenComment = commentAnnotation !== null;

  const reset = useCallback(() => {
    setCommentAnnotation(null);
    setSelectedRange(null);
  }, []);

  const handleLineSelectionEnd = useCallback(
    (range: SelectedLineRange | null) => {
      setSelectedRange(range);
      if (range == null) return;
      const derivedSide = range.endSide ?? range.side;
      const side: AnnotationSide =
        derivedSide === "deletions" ? "deletions" : "additions";
      const startLine = Math.min(range.start, range.end);
      const endLine = Math.max(range.start, range.end);

      setCommentAnnotation({
        side,
        lineNumber: endLine,
        metadata: { kind: "comment", startLine, endLine, side },
      });
    },
    [],
  );

  return {
    selectedRange,
    commentAnnotation,
    hasOpenComment,
    reset,
    handleLineSelectionEnd,
  };
}
