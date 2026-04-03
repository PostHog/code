import type { AnnotationSide, FileDiffOptions } from "@pierre/diffs";
import type { FileDiffProps, MultiFileDiffProps } from "@pierre/diffs/react";

export interface HunkRevertMetadata {
  kind: "hunk-revert";
  hunkIndex: number;
}

export interface CommentMetadata {
  kind: "comment";
  startLine: number;
  endLine: number;
  side: AnnotationSide;
}

export type AnnotationMetadata = HunkRevertMetadata | CommentMetadata;

export type DiffOptions = FileDiffOptions<AnnotationMetadata>;

export type OnCommentCallback = (
  filePath: string,
  startLine: number,
  endLine: number,
  side: AnnotationSide,
  comment: string,
) => void;

export type PatchDiffProps = FileDiffProps<AnnotationMetadata> & {
  repoPath?: string;
  onComment?: OnCommentCallback;
};

export type FilesDiffProps = MultiFileDiffProps<AnnotationMetadata> & {
  onComment?: OnCommentCallback;
};

export type InteractiveFileDiffProps = PatchDiffProps | FilesDiffProps;
