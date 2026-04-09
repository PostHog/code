import type { PrReviewComment } from "@main/services/git/schemas";
import type { PrCommentThread } from "@renderer/features/code-review/utils/prCommentAnnotations";
import { useTRPC } from "@renderer/trpc";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

interface UsePrDetailsOptions {
  includeComments?: boolean;
}

function groupCommentsIntoThreads(
  comments: PrReviewComment[],
): Map<number, PrCommentThread> {
  const threads = new Map<number, PrCommentThread>();

  for (const comment of comments) {
    const rootId = comment.in_reply_to_id ?? comment.id;
    const existing = threads.get(rootId);
    if (existing) {
      existing.comments.push(comment);
    } else {
      threads.set(rootId, {
        rootId,
        comments: [comment],
        filePath: comment.path,
      });
    }
  }

  for (const thread of threads.values()) {
    thread.comments.sort((a, b) => a.created_at.localeCompare(b.created_at));
  }

  return threads;
}

export function usePrDetails(
  prUrl: string | null,
  options?: UsePrDetailsOptions,
) {
  const { includeComments = false } = options ?? {};
  const trpc = useTRPC();

  const metaQuery = useQuery(
    trpc.git.getPrDetailsByUrl.queryOptions(
      { prUrl: prUrl as string },
      {
        enabled: !!prUrl,
        staleTime: 60_000,
        retry: 1,
      },
    ),
  );

  const commentsQuery = useQuery(
    trpc.git.getPrReviewComments.queryOptions(
      { prUrl: prUrl as string },
      {
        enabled: !!prUrl && includeComments,
        staleTime: 30_000,
        refetchInterval: 30_000,
        retry: 1,
        structuralSharing: true,
      },
    ),
  );

  const commentThreads = useMemo(
    () => groupCommentsIntoThreads(commentsQuery.data ?? []),
    [commentsQuery.data],
  );

  return {
    meta: {
      state: metaQuery.data?.state ?? null,
      merged: metaQuery.data?.merged ?? false,
      draft: metaQuery.data?.draft ?? false,
      isLoading: metaQuery.isLoading,
    },
    commentThreads,
  };
}
