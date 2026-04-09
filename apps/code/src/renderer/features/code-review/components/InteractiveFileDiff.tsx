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
import { buildFileAnnotations } from "../utils/prCommentAnnotations";
import { CommentAnnotation } from "./CommentAnnotation";
import { PrCommentThread } from "./PrCommentThread";

function renderSharedAnnotation(
  annotation: DiffLineAnnotation<AnnotationMetadata>,
  filePath: string,
  taskId: string,
  prUrl: string | null,
  reset: () => void,
): React.ReactNode {
  if (annotation.metadata.kind === "comment") {
    const { startLine, endLine, side } = annotation.metadata;
    return (
      <CommentAnnotation
        taskId={taskId}
        filePath={filePath}
        startLine={startLine}
        endLine={endLine}
        side={side}
        onDismiss={reset}
      />
    );
  }

  if (annotation.metadata.kind === "pr-comment") {
    return (
      <PrCommentThread
        taskId={taskId}
        prUrl={prUrl}
        filePath={filePath}
        metadata={annotation.metadata}
      />
    );
  }

  return null;
}

function HunkRevertButton({
  isReverting,
  onRevert,
}: {
  isReverting: boolean;
  onRevert: () => void;
}) {
  return (
    <div className="relative w-full overflow-visible" style={{ height: 0 }}>
      <button
        type="button"
        disabled={isReverting}
        onClick={onRevert}
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
}

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
  prUrl,
  commentThreads,
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
  const prAnnotations = useMemo(
    () =>
      commentThreads
        ? buildFileAnnotations(commentThreads, currentFilePath)
        : [],
    [commentThreads, currentFilePath],
  );
  const annotations = useMemo(() => {
    const all = [...hunkAnnotations, ...prAnnotations];
    if (commentAnnotation) all.push(commentAnnotation);
    return all;
  }, [hunkAnnotations, prAnnotations, commentAnnotation]);

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
      if (annotation.metadata.kind === "hunk-revert") {
        const { hunkIndex } = annotation.metadata;
        return (
          <HunkRevertButton
            isReverting={revertingHunks.has(hunkIndex)}
            onRevert={() => handleRevert(hunkIndex)}
          />
        );
      }

      return renderSharedAnnotation(
        annotation,
        currentFilePath,
        taskId ?? "",
        prUrl ?? null,
        reset,
      );
    },
    [handleRevert, revertingHunks, reset, taskId, prUrl, currentFilePath],
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
  prUrl,
  commentThreads,
}: FilesDiffProps) {
  const {
    selectedRange,
    commentAnnotation,
    hasOpenComment,
    reset,
    handleLineSelectionEnd,
  } = useCommentState();

  const filePath = newFile.name || oldFile.name;

  const prAnnotations = useMemo(
    () =>
      commentThreads ? buildFileAnnotations(commentThreads, filePath) : [],
    [commentThreads, filePath],
  );
  const annotations = useMemo(() => {
    const all = [...prAnnotations];
    if (commentAnnotation) all.push(commentAnnotation);
    return all;
  }, [prAnnotations, commentAnnotation]);

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<AnnotationMetadata>) =>
      renderSharedAnnotation(
        annotation,
        filePath,
        taskId ?? "",
        prUrl ?? null,
        reset,
      ),
    [reset, taskId, prUrl, filePath],
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
