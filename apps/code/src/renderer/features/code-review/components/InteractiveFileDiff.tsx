import { ArrowCounterClockwise } from "@phosphor-icons/react";
import {
  type DiffLineAnnotation,
  diffAcceptRejectHunk,
  parseDiffFromFile,
} from "@pierre/diffs";
import { FileDiff, MultiFileDiff } from "@pierre/diffs/react";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { useCommentState } from "../hooks/useCommentState";
import type {
  AnnotationMetadata,
  FilesDiffProps,
  InteractiveFileDiffProps,
  PatchDiffProps,
} from "../types";
import {
  buildCommentMergedOptions,
  buildHunkAnnotations,
} from "../utils/diffAnnotations";
import { CommentAnnotation } from "./CommentAnnotation";

function isPatchDiff(props: InteractiveFileDiffProps): props is PatchDiffProps {
  return "fileDiff" in props && props.fileDiff != null;
}

export function InteractiveFileDiff(props: InteractiveFileDiffProps) {
  if (isPatchDiff(props)) {
    return <PatchDiffView {...props} />;
  }
  return <FilesDiffView {...props} />;
}

function PatchDiffView({
  fileDiff: initialFileDiff,
  repoPath,
  options,
  renderCustomHeader,
  taskId,
}: PatchDiffProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [fileDiff, setFileDiff] = useState(initialFileDiff);
  const [revertingHunks, setRevertingHunks] = useState<Set<number>>(
    () => new Set(),
  );

  const {
    selectedRange,
    commentAnnotation,
    hasOpenComment,
    reset,
    handleLineSelectionEnd,
  } = useCommentState();

  const [lastInitial, setLastInitial] = useState(initialFileDiff);
  if (initialFileDiff !== lastInitial) {
    setLastInitial(initialFileDiff);
    setFileDiff(initialFileDiff);
    setRevertingHunks(new Set());
    reset();
  }

  const currentFilePath = fileDiff.name ?? fileDiff.prevName ?? "";
  const filePathRef = useRef(currentFilePath);
  filePathRef.current = currentFilePath;

  const hunkAnnotations = useMemo(
    () => (repoPath ? buildHunkAnnotations(fileDiff) : []),
    [fileDiff, repoPath],
  );
  const annotations = useMemo(
    () =>
      commentAnnotation
        ? [...hunkAnnotations, commentAnnotation]
        : hunkAnnotations,
    [hunkAnnotations, commentAnnotation],
  );

  const handleRevert = useCallback(
    async (hunkIndex: number) => {
      const filePath = filePathRef.current;
      if (!filePath || !repoPath) return;

      setRevertingHunks((prev) => new Set(prev).add(hunkIndex));
      setFileDiff((prev) => diffAcceptRejectHunk(prev, hunkIndex, "reject"));

      try {
        const [originalContent, modifiedContent] = await Promise.all([
          trpcClient.git.getFileAtHead.query({
            directoryPath: repoPath,
            filePath,
          }),
          trpcClient.fs.readRepoFile.query({
            repoPath,
            filePath,
          }),
        ]);

        const fullDiff = parseDiffFromFile(
          { name: filePath, contents: originalContent ?? "" },
          { name: filePath, contents: modifiedContent ?? "" },
        );

        const reverted = diffAcceptRejectHunk(fullDiff, hunkIndex, "reject");
        const newContent = reverted.additionLines.join("");

        await trpcClient.fs.writeRepoFile.mutate({
          repoPath,
          filePath,
          content: newContent,
        });

        queryClient.invalidateQueries(
          trpc.git.getDiffHead.queryFilter({ directoryPath: repoPath }),
        );
        queryClient.invalidateQueries(
          trpc.git.getChangedFilesHead.queryFilter({ directoryPath: repoPath }),
        );
      } catch {
        setFileDiff(initialFileDiff);
      } finally {
        setRevertingHunks((prev) => {
          const next = new Set(prev);
          next.delete(hunkIndex);
          return next;
        });
      }
    },
    [repoPath, initialFileDiff, queryClient, trpc],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMetadata>) => {
      if (annotation.metadata.kind === "comment") {
        const { startLine, endLine, side } = annotation.metadata;
        return (
          <CommentAnnotation
            taskId={taskId ?? ""}
            filePath={currentFilePath}
            startLine={startLine}
            endLine={endLine}
            side={side}
            onDismiss={reset}
          />
        );
      }

      if (annotation.metadata.kind !== "hunk-revert") return null;
      const { hunkIndex } = annotation.metadata;
      const isReverting = revertingHunks.has(hunkIndex);

      return (
        <div className="relative w-full overflow-visible" style={{ height: 0 }}>
          <button
            type="button"
            disabled={isReverting}
            onClick={() => handleRevert(hunkIndex)}
            className={`absolute top-0 right-2 inline-flex items-center gap-0.5 rounded border-none text-white transition-opacity ${
              isReverting ? "opacity-60" : "opacity-0 hover:opacity-100"
            }`}
            style={{
              background: "var(--red-9)",
              padding: "1px 6px",
              fontSize: "10px",
              fontWeight: 500,
              lineHeight: "18px",
              cursor: isReverting ? "default" : "pointer",
              zIndex: 10,
            }}
          >
            <ArrowCounterClockwise size={12} />
            {isReverting ? "Reverting..." : "Revert"}
          </button>
        </div>
      );
    },
    [handleRevert, reset, revertingHunks, taskId, currentFilePath],
  );

  const mergedOptions = useMemo(
    () =>
      buildCommentMergedOptions(
        options,
        hasOpenComment,
        handleLineSelectionEnd,
      ),
    [options, hasOpenComment, handleLineSelectionEnd],
  );

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={mergedOptions}
      lineAnnotations={annotations}
      selectedLines={selectedRange}
      renderAnnotation={renderAnnotation}
      renderCustomHeader={renderCustomHeader}
    />
  );
}

function FilesDiffView({
  oldFile,
  newFile,
  options,
  renderCustomHeader,
  taskId,
}: FilesDiffProps) {
  const {
    selectedRange,
    commentAnnotation,
    hasOpenComment,
    reset,
    handleLineSelectionEnd,
  } = useCommentState();

  const filePath = newFile.name || oldFile.name;

  const annotations = useMemo(
    () => (commentAnnotation ? [commentAnnotation] : []),
    [commentAnnotation],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMetadata>) => {
      if (annotation.metadata.kind !== "comment") return null;
      const { startLine, endLine, side } = annotation.metadata;
      return (
        <CommentAnnotation
          taskId={taskId ?? ""}
          filePath={filePath}
          startLine={startLine}
          endLine={endLine}
          side={side}
          onDismiss={reset}
        />
      );
    },
    [reset, taskId, filePath],
  );

  const mergedOptions = useMemo(
    () =>
      buildCommentMergedOptions(
        options,
        hasOpenComment,
        handleLineSelectionEnd,
      ),
    [options, hasOpenComment, handleLineSelectionEnd],
  );

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={mergedOptions}
      lineAnnotations={annotations}
      selectedLines={selectedRange}
      renderAnnotation={renderAnnotation}
      renderCustomHeader={renderCustomHeader}
    />
  );
}
