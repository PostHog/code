import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import { sendPromptToAgent } from "@features/sessions/utils/sendPromptToAgent";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import type { PrReviewComment } from "@main/services/git/schemas";
import {
  CaretDown,
  CaretUp,
  ChatCircle,
  File,
  Robot,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import {
  Avatar,
  Badge,
  Box,
  Button,
  Flex,
  IconButton,
  Text,
} from "@radix-ui/themes";
import { formatRelativeTimeShort } from "@utils/time";
import { useCallback, useEffect, useRef, useState } from "react";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { PluggableList } from "unified";
import { usePrCommentActions } from "../hooks/usePrCommentActions";
import type { PrCommentMetadata } from "../types";
import {
  buildAskAboutPrCommentPrompt,
  buildFixPrCommentPrompt,
} from "../utils/reviewPrompts";

const ghRehypePlugins: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, defaultSchema],
];

const MAX_COMMENT_HEIGHT = 120;

interface ThreadActionBarProps {
  prUrl: string | null;
  taskId: string;
  filePath: string;
  endLine: number;
  side: "old" | "new";
  comments: PrReviewComment[];
  showReplyBox: boolean;
  pendingReply: string | null;
  onShowReplyBox: () => void;
  onHideReplyBox: () => void;
  onSubmitReply: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  textareaRefCallback: (el: HTMLTextAreaElement | null) => void;
}

function ThreadActionBar({
  prUrl,
  taskId,
  filePath,
  endLine,
  side,
  comments,
  showReplyBox,
  pendingReply,
  onShowReplyBox,
  onHideReplyBox,
  onSubmitReply,
  onKeyDown,
  textareaRefCallback,
}: ThreadActionBarProps) {
  const agentActionsEnabled = useFeatureFlag("posthog-code-pr-agent-actions");

  if (showReplyBox) {
    return (
      <div className="mt-1.5 border-[var(--gray-4)] border-t pt-1.5">
        <textarea
          ref={textareaRefCallback}
          placeholder="Write a reply..."
          onKeyDown={onKeyDown}
          className="w-full resize-none rounded border border-[var(--gray-6)] bg-[var(--color-background)] p-1.5 text-[13px] text-[var(--gray-12)] leading-normal outline-none"
          style={{ minHeight: 48 }}
        />
        <Flex align="center" gap="3" className="mt-1.5">
          <Button size="1" onClick={onSubmitReply} disabled={!!pendingReply}>
            <ChatCircle size={12} />
            {pendingReply ? "Sending..." : "Reply"}
          </Button>
          <IconButton
            size="1"
            variant="ghost"
            color="gray"
            onClick={onHideReplyBox}
          >
            <X size={12} />
          </IconButton>
        </Flex>
      </div>
    );
  }

  return (
    <Flex
      align="center"
      gap="1"
      className="mt-1 border-[var(--gray-4)] border-t pt-1.5"
    >
      {prUrl && (
        <Button size="1" variant="ghost" color="gray" onClick={onShowReplyBox}>
          <ChatCircle size={12} />
          Reply
        </Button>
      )}
      {/* TODO: remove this flag when https://github.com/posthog/code/issues/1533 is fixed
          currently set to 0% rollout. didn't discover the cloud bug until i had already built this
          xoxo, adboio */}
      {agentActionsEnabled && (
        <>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={() =>
              sendPromptToAgent(
                taskId,
                buildFixPrCommentPrompt(filePath, endLine, side, comments),
              )
            }
          >
            <Robot size={12} />
            Fix with agent
          </Button>
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={() =>
              sendPromptToAgent(
                taskId,
                buildAskAboutPrCommentPrompt(filePath, endLine, side, comments),
              )
            }
          >
            <Robot size={12} />
            Ask agent
          </Button>
        </>
      )}
    </Flex>
  );
}

interface PrCommentThreadProps {
  taskId: string;
  prUrl: string | null;
  filePath: string;
  metadata: PrCommentMetadata;
}

function CommentBody({
  comment,
  showLineAbove = false,
  showLineBelow = false,
}: {
  comment: PrReviewComment;
  showLineAbove?: boolean;
  showLineBelow?: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > MAX_COMMENT_HEIGHT);
    }
  }, []);

  return (
    <div className="flex gap-2">
      <div className="flex flex-col items-center">
        {showLineAbove ? (
          <div className="h-1.5 w-0.5 rounded-full bg-[var(--gray-5)]" />
        ) : (
          <div className="h-1.5" />
        )}
        <Avatar
          size="1"
          radius="full"
          src={comment.user.avatar_url}
          fallback={comment.user.login[0]?.toUpperCase() ?? "?"}
          className="shrink-0"
        />
        {showLineBelow && (
          <div className="w-0.5 flex-1 rounded-full bg-[var(--gray-5)]" />
        )}
      </div>
      <div className="min-w-0 flex-1 pt-1.5 pb-1.5">
        <Flex align="center" gap="2" className="mb-0.5">
          <Text size="1" weight="medium" className="text-[var(--gray-12)]">
            {comment.user.login}
          </Text>
          <Text size="1" className="text-[var(--gray-9)]">
            {formatRelativeTimeShort(comment.created_at)}
          </Text>
        </Flex>
        <Box
          ref={contentRef}
          className="relative overflow-hidden text-[13px] text-[var(--gray-11)] leading-relaxed [&_code]:break-all [&_img]:max-w-full [&_p]:m-0 [&_pre]:max-w-full [&_pre]:overflow-x-auto"
          style={{
            maxHeight:
              isExpanded || !isOverflowing
                ? undefined
                : `${MAX_COMMENT_HEIGHT}px`,
            overflowWrap: "break-word",
            wordBreak: "break-word",
          }}
        >
          <MarkdownRenderer
            content={comment.body}
            rehypePlugins={ghRehypePlugins}
          />
          {!isExpanded && isOverflowing && (
            <Box
              className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
              style={{
                background: "linear-gradient(transparent, var(--gray-2))",
              }}
            />
          )}
        </Box>
        {isOverflowing && (
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="mt-1"
          >
            {isExpanded ? (
              <>
                <CaretUp size={12} />
                Show less
              </>
            ) : (
              <>
                <CaretDown size={12} />
                Show more
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

export function PrCommentThread({
  taskId,
  prUrl,
  filePath,
  metadata,
}: PrCommentThreadProps) {
  const {
    threadId,
    comments,
    isOutdated,
    isFileLevel,
    endLine,
    side: annotationSide,
  } = metadata;
  const side = annotationSide === "deletions" ? "old" : "new";
  const { reply } = usePrCommentActions(prUrl);
  const [showReplyBox, setShowReplyBox] = useState(false);
  const [pendingReply, setPendingReply] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Clear pending reply once the real comments list includes it
  const lastCommentId = comments[comments.length - 1]?.id;
  const prevLastCommentIdRef = useRef(lastCommentId);
  useEffect(() => {
    if (lastCommentId !== prevLastCommentIdRef.current && pendingReply) {
      setPendingReply(null);
    }
    prevLastCommentIdRef.current = lastCommentId;
  }, [lastCommentId, pendingReply]);

  const handleReplySubmit = useCallback(async () => {
    const text = textareaRef.current?.value?.trim();
    if (text) {
      setPendingReply(text);
      setShowReplyBox(false);
      const success = await reply(threadId, text);
      if (!success) {
        setPendingReply(null);
      }
    }
  }, [reply, threadId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleReplySubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowReplyBox(false);
      }
    },
    [handleReplySubmit],
  );

  const setTextareaRefCallback = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textareaRef.current = el;
      if (el) {
        requestAnimationFrame(() => el.focus());
      }
    },
    [],
  );

  return (
    <div className="px-3 py-1.5" style={{ contain: "inline-size" }}>
      <div
        data-pr-comment-thread=""
        className="overflow-hidden whitespace-normal rounded-md border border-[var(--gray-5)] bg-[var(--gray-2)] px-2.5 py-2 font-sans"
      >
        {(isOutdated || isFileLevel) && (
          <Flex align="center" gap="1" className="mb-1.5">
            {isFileLevel && (
              <Badge color="gray" size="1" variant="soft">
                <File size={12} />
                File comment
              </Badge>
            )}
            {isOutdated && (
              <Badge color="yellow" size="1" variant="soft">
                <WarningCircle size={12} weight="fill" />
                Outdated
              </Badge>
            )}
          </Flex>
        )}

        {comments.map((comment, index) => (
          <CommentBody
            key={comment.id}
            comment={comment}
            showLineAbove={index > 0}
            showLineBelow={index < comments.length - 1 || !!pendingReply}
          />
        ))}

        {pendingReply && (
          <div className="flex gap-2 opacity-50">
            <div className="flex flex-col items-center">
              <div className="h-1.5 w-0.5 rounded-full bg-[var(--gray-5)]" />
              <Avatar size="1" radius="full" fallback="" className="shrink-0" />
            </div>
            <div className="min-w-0 flex-1 pt-1.5 pb-1.5">
              <Flex align="center" gap="2" className="mb-0.5">
                <Text
                  size="1"
                  weight="medium"
                  className="text-[var(--gray-12)]"
                >
                  Sending...
                </Text>
              </Flex>
              <div className="text-[13px] text-[var(--gray-11)] leading-relaxed">
                <MarkdownRenderer
                  content={pendingReply}
                  rehypePlugins={ghRehypePlugins}
                />
              </div>
            </div>
          </div>
        )}

        <ThreadActionBar
          prUrl={prUrl}
          taskId={taskId}
          filePath={filePath}
          endLine={endLine}
          side={side}
          comments={comments}
          showReplyBox={showReplyBox}
          pendingReply={pendingReply}
          onShowReplyBox={() => setShowReplyBox(true)}
          onHideReplyBox={() => setShowReplyBox(false)}
          onSubmitReply={handleReplySubmit}
          onKeyDown={handleKeyDown}
          textareaRefCallback={setTextareaRefCallback}
        />
      </div>
    </div>
  );
}
