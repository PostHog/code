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

export type PatchDiffProps = FileDiffProps<AnnotationMetadata> & {
  repoPath?: string;
  taskId?: string;
};

export type FilesDiffProps = MultiFileDiffProps<AnnotationMetadata> & {
  taskId?: string;
};

export type InteractiveFileDiffProps = PatchDiffProps | FilesDiffProps;
