import type { ChangedFile } from "@shared/types";
import type { DiffOptions } from "../types";
import type { PrCommentThread } from "../utils/prCommentAnnotations";
import { LazyDiff } from "./LazyDiff";
import { PatchedFileDiff } from "./PatchedFileDiff";
import { DeferredDiffPlaceholder, type DeferredReason } from "./ReviewShell";

interface RemoteDiffListProps {
  files: ChangedFile[];
  taskId: string;
  options: DiffOptions;
  collapsedFiles: Set<string>;
  toggleFile: (path: string) => void;
  revealFile: (path: string) => void;
  getDeferredReason: (path: string) => DeferredReason | null;
  prUrl?: string | null;
  commentThreads?: Map<number, PrCommentThread>;
  fallbacks?: Map<string, { oldText: string | null; newText: string | null }>;
}

export function RemoteDiffList({
  files,
  taskId,
  options,
  collapsedFiles,
  toggleFile,
  revealFile,
  getDeferredReason,
  prUrl,
  commentThreads,
  fallbacks,
}: RemoteDiffListProps) {
  return files.map((file) => {
    const isCollapsed = collapsedFiles.has(file.path);
    const deferredReason = getDeferredReason(file.path);

    if (deferredReason) {
      return (
        <div key={file.path} data-file-path={file.path}>
          <DeferredDiffPlaceholder
            filePath={file.path}
            linesAdded={file.linesAdded ?? 0}
            linesRemoved={file.linesRemoved ?? 0}
            reason={deferredReason}
            collapsed={isCollapsed}
            onToggle={() => toggleFile(file.path)}
            onShow={() => revealFile(file.path)}
          />
        </div>
      );
    }

    const githubFileUrl = prUrl
      ? `${prUrl}/files#diff-${file.path.replaceAll("/", "-")}`
      : undefined;

    return (
      <div key={file.path} data-file-path={file.path}>
        <LazyDiff>
          <PatchedFileDiff
            file={file}
            taskId={taskId}
            prUrl={prUrl}
            options={options}
            collapsed={isCollapsed}
            onToggle={() => toggleFile(file.path)}
            commentThreads={commentThreads}
            fallback={fallbacks?.get(file.path) ?? null}
            externalUrl={githubFileUrl}
          />
        </LazyDiff>
      </div>
    );
  });
}
