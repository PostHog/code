import { ArrowCounterClockwise } from "@phosphor-icons/react";
import {
  type DiffLineAnnotation,
  diffAcceptRejectHunk,
  type FileDiffMetadata,
  type FileDiffOptions,
  parseDiffFromFile,
} from "@pierre/diffs";
import { FileDiff } from "@pierre/diffs/react";
import { trpcClient, useTRPC } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

interface HunkRevertMetadata {
  kind: "hunk-revert";
  hunkIndex: number;
}

export type ReviewAnnotationMetadata = HunkRevertMetadata;

function getLastChangeLineNumber(
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

function buildHunkAnnotations(
  fileDiff: FileDiffMetadata,
): DiffLineAnnotation<ReviewAnnotationMetadata>[] {
  return fileDiff.hunks
    .filter((h) => h.additionLines > 0 || h.deletionLines > 0)
    .map((hunk) => {
      const hunkIndex = fileDiff.hunks.indexOf(hunk);
      return {
        side: "additions" as const,
        lineNumber: getLastChangeLineNumber(hunk),
        metadata: { kind: "hunk-revert" as const, hunkIndex },
      };
    });
}

interface RevertableFileDiffProps {
  fileDiff: FileDiffMetadata;
  repoPath: string;
  options: FileDiffOptions<ReviewAnnotationMetadata>;
  renderCustomHeader: (fd: FileDiffMetadata) => React.ReactNode;
}

export function RevertableFileDiff({
  fileDiff: initialFileDiff,
  repoPath,
  options,
  renderCustomHeader,
}: RevertableFileDiffProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [fileDiff, setFileDiff] = useState(initialFileDiff);
  const [revertingHunks, setRevertingHunks] = useState<Set<number>>(
    () => new Set(),
  );

  // Sync with parent when the diff data changes (e.g. after query refetch)
  const [lastInitial, setLastInitial] = useState(initialFileDiff);
  if (initialFileDiff !== lastInitial) {
    setLastInitial(initialFileDiff);
    setFileDiff(initialFileDiff);
    setRevertingHunks(new Set());
  }

  const annotations = useMemo(() => buildHunkAnnotations(fileDiff), [fileDiff]);

  const handleRevert = useCallback(
    async (hunkIndex: number) => {
      const filePath = fileDiff.name ?? fileDiff.prevName ?? "";
      if (!filePath) return;

      setRevertingHunks((prev) => new Set(prev).add(hunkIndex));
      setFileDiff((prev) => diffAcceptRejectHunk(prev, hunkIndex, "reject"));

      try {
        const [originalContent, modifiedContent] = await Promise.all([
          trpcClient.git.getFileAtHead.query({
            directoryPath: repoPath,
            filePath,
          }),
          trpcClient.fs.readRepoFile.query({ repoPath, filePath }),
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
    [fileDiff, repoPath, initialFileDiff, queryClient, trpc],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<ReviewAnnotationMetadata>) => {
      if (annotation.metadata.kind !== "hunk-revert") return null;
      const isReverting = revertingHunks.has(annotation.metadata.hunkIndex);

      return (
        <div className="relative w-full overflow-visible" style={{ height: 0 }}>
          <button
            type="button"
            disabled={isReverting}
            onClick={() => handleRevert(annotation.metadata.hunkIndex)}
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
    [handleRevert, revertingHunks],
  );

  const mergedOptions = useMemo(
    () => ({
      ...options,
      unsafeCSS: `${(options.unsafeCSS as string) ?? ""} [data-line-annotation] { height: 0; min-height: 0; overflow: visible; }`,
    }),
    [options],
  );

  return (
    <FileDiff
      fileDiff={fileDiff}
      options={mergedOptions}
      lineAnnotations={annotations}
      renderAnnotation={renderAnnotation}
      renderCustomHeader={renderCustomHeader}
    />
  );
}
