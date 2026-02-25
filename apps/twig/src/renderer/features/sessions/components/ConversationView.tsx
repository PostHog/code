import {
  sessionStoreSetters,
  usePendingPermissionsForTask,
  useQueuedMessagesForTask,
} from "@features/sessions/stores/sessionStore";
import {
  type ScrollAnchor,
  useSessionViewActions,
} from "@features/sessions/stores/sessionViewStore";
import { ArrowDown, XCircle } from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type { AcpMessage } from "@shared/types/session-events";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildConversationItems,
  type ConversationItem,
  type TurnContext,
} from "./buildConversationItems";
import { GitActionMessage } from "./GitActionMessage";
import { GitActionResult } from "./GitActionResult";
import { SessionFooter } from "./SessionFooter";
import { QueuedMessageView } from "./session-update/QueuedMessageView";
import {
  type RenderItem,
  SessionUpdateView,
} from "./session-update/SessionUpdateView";
import { UserMessage } from "./session-update/UserMessage";
import { UserShellExecuteView } from "./session-update/UserShellExecuteView";
import { VirtualizedList, type VirtualizedListHandle } from "./VirtualizedList";

interface ConversationViewProps {
  events: AcpMessage[];
  isPromptPending: boolean;
  promptStartedAt?: number | null;
  repoPath?: string | null;
  taskId?: string;
}

const SHOW_BUTTON_THRESHOLD = 300;
const ESTIMATE_SIZE = 150;
const SCROLL_SAVE_DEBOUNCE_MS = 150;

export function ConversationView({
  events,
  isPromptPending,
  promptStartedAt,
  repoPath,
  taskId,
}: ConversationViewProps) {
  const listRef = useRef<VirtualizedListHandle>(null);
  const { items: conversationItems, lastTurnInfo } = useMemo(
    () => buildConversationItems(events, isPromptPending),
    [events, isPromptPending],
  );

  const pendingPermissions = usePendingPermissionsForTask(taskId ?? "");
  const pendingPermissionsCount = pendingPermissions.size;

  const queuedMessages = useQueuedMessagesForTask(taskId);
  const { saveScrollAnchor, getScrollAnchor } = useSessionViewActions();

  const [showScrollButton, setShowScrollButton] = useState(false);
  const showScrollButtonRef = useRef(false);
  const hasRestoredScrollRef = useRef(false);
  const prevTaskIdRef = useRef(taskId);
  const prevItemCountRef = useRef(0);
  const prevPendingCountRef = useRef(0);
  const prevEventsLengthRef = useRef(events.length);
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const queuedItems = useMemo<Extract<ConversationItem, { type: "queued" }>[]>(
    () =>
      queuedMessages.map((msg) => ({
        type: "queued" as const,
        id: msg.id,
        message: msg,
      })),
    [queuedMessages],
  );

  const virtualizedItems = useMemo<ConversationItem[]>(
    () =>
      queuedItems.length > 0
        ? [...conversationItems, ...queuedItems]
        : conversationItems,
    [conversationItems, queuedItems],
  );

  const applyScrollAnchor = useCallback((anchor: ScrollAnchor) => {
    listRef.current?.scrollToIndex(anchor.index, { align: "start" });
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex(anchor.index, { align: "start" });
      if (anchor.offsetFromTop > 0) {
        const el = document.querySelector(`[data-index="${anchor.index}"]`);
        if (el) {
          const container = el.closest("[data-scroll-container]");
          if (container) {
            container.scrollTop += anchor.offsetFromTop;
          }
        }
      }
    });
  }, []);

  // Reset hasRestoredScrollRef when taskId changes
  useEffect(() => {
    if (taskId !== prevTaskIdRef.current) {
      // Flush pending scroll save for the previous task
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current);
        scrollSaveTimerRef.current = null;
        const prevId = prevTaskIdRef.current;
        if (prevId) {
          const anchor = listRef.current?.getScrollAnchor();
          if (anchor) {
            saveScrollAnchor(prevId, anchor);
          }
        }
      }
      hasRestoredScrollRef.current = false;
      prevTaskIdRef.current = taskId;
    }
  }, [taskId, saveScrollAnchor]);

  // Restore scroll position using index-based anchor
  useEffect(() => {
    if (!taskId || hasRestoredScrollRef.current) return;

    const savedAnchor = getScrollAnchor(taskId);
    if (savedAnchor) {
      applyScrollAnchor(savedAnchor);
      hasRestoredScrollRef.current = true;
    }
  }, [taskId, getScrollAnchor, applyScrollAnchor]);

  useEffect(() => {
    const isNewContent = virtualizedItems.length > prevItemCountRef.current;
    const isNewPending = pendingPermissionsCount > prevPendingCountRef.current;
    const isNewEvents = events.length > prevEventsLengthRef.current;
    prevItemCountRef.current = virtualizedItems.length;
    prevPendingCountRef.current = pendingPermissionsCount;
    prevEventsLengthRef.current = events.length;

    // Only auto-scroll when user is at the bottom
    if (!showScrollButtonRef.current) {
      if (isNewContent || isNewPending || isNewEvents) {
        listRef.current?.scrollToBottom();
      }
    }
  }, [events.length, virtualizedItems.length, pendingPermissionsCount]);

  // Flush pending scroll save on unmount
  useEffect(() => {
    return () => {
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current);
        const currentTaskId = prevTaskIdRef.current;
        if (currentTaskId) {
          const anchor = listRef.current?.getScrollAnchor();
          if (anchor) {
            saveScrollAnchor(currentTaskId, anchor);
          }
        }
      }
    };
  }, [saveScrollAnchor]);

  const handleScroll = useCallback(
    (scrollOffset: number, scrollHeight: number, clientHeight: number) => {
      const distanceFromBottom = scrollHeight - scrollOffset - clientHeight;
      const isScrolledUp = distanceFromBottom > SHOW_BUTTON_THRESHOLD;
      if (showScrollButtonRef.current !== isScrolledUp) {
        setShowScrollButton(isScrolledUp);
      }
      showScrollButtonRef.current = isScrolledUp;

      if (taskId) {
        if (scrollSaveTimerRef.current) {
          clearTimeout(scrollSaveTimerRef.current);
        }
        scrollSaveTimerRef.current = setTimeout(() => {
          const anchor = listRef.current?.getScrollAnchor();
          if (anchor) {
            saveScrollAnchor(taskId, anchor);
          }
        }, SCROLL_SAVE_DEBOUNCE_MS);
      }
    },
    [taskId, saveScrollAnchor],
  );

  const restoreScrollAnchor = useCallback(() => {
    if (!taskId) return;
    const savedAnchor = getScrollAnchor(taskId);
    if (savedAnchor) {
      applyScrollAnchor(savedAnchor);
    }
  }, [taskId, getScrollAnchor, applyScrollAnchor]);

  const handleBecameVisible = useCallback(() => {
    restoreScrollAnchor();
  }, [restoreScrollAnchor]);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToBottom();
  }, []);

  const renderItem = useCallback(
    (item: ConversationItem) => {
      switch (item.type) {
        case "user_message":
          return (
            <UserMessage content={item.content} timestamp={item.timestamp} />
          );
        case "git_action":
          return <GitActionMessage actionType={item.actionType} />;
        case "session_update":
          return (
            <SessionUpdateRow
              update={item.update}
              turnContext={item.turnContext}
            />
          );
        case "git_action_result":
          return repoPath ? (
            <GitActionResult
              actionType={item.actionType}
              repoPath={repoPath}
              turnId={item.turnId}
            />
          ) : null;
        case "turn_cancelled":
          return <TurnCancelledView interruptReason={item.interruptReason} />;
        case "user_shell_execute":
          return <UserShellExecuteView item={item} />;
        case "queued":
          return (
            <QueuedMessageView
              message={item.message}
              onRemove={
                taskId
                  ? () =>
                      sessionStoreSetters.removeQueuedMessage(
                        taskId,
                        item.message.id,
                      )
                  : undefined
              }
            />
          );
      }
    },
    [repoPath, taskId],
  );

  const getItemKey = useCallback((item: ConversationItem) => item.id, []);

  return (
    <div className="relative flex-1">
      <VirtualizedList
        ref={listRef}
        items={virtualizedItems}
        estimateSize={ESTIMATE_SIZE}
        gap={12}
        overscan={10}
        getItemKey={getItemKey}
        renderItem={renderItem}
        onScroll={handleScroll}
        onBecameVisible={handleBecameVisible}
        className="absolute inset-0 bg-gray-1 p-2"
        innerClassName="mx-auto max-w-[750px]"
        footer={
          <div className="pb-16">
            <SessionFooter
              isPromptPending={isPromptPending}
              promptStartedAt={promptStartedAt}
              lastGenerationDuration={
                lastTurnInfo?.isComplete ? lastTurnInfo.durationMs : null
              }
              lastStopReason={lastTurnInfo?.stopReason}
              queuedCount={queuedMessages.length}
              hasPendingPermission={pendingPermissionsCount > 0}
            />
          </div>
        }
      />
      {showScrollButton && (
        <Box className="absolute right-4 bottom-4 z-10">
          <Button size="1" variant="solid" onClick={scrollToBottom}>
            <ArrowDown size={14} weight="bold" />
            Scroll to bottom
          </Button>
        </Box>
      )}
    </div>
  );
}

const SessionUpdateRow = memo(function SessionUpdateRow({
  update,
  turnContext,
}: {
  update: RenderItem;
  turnContext: TurnContext;
}) {
  return (
    <SessionUpdateView
      item={update}
      toolCalls={turnContext.toolCalls}
      childItems={turnContext.childItems}
      turnCancelled={turnContext.turnCancelled}
      turnComplete={turnContext.turnComplete}
    />
  );
});

function getInterruptMessage(reason?: string): string {
  switch (reason) {
    case "moving_to_worktree":
      return "Paused while worktree is focused";
    default:
      return "Interrupted by user";
  }
}

const TurnCancelledView = memo(function TurnCancelledView({
  interruptReason,
}: {
  interruptReason?: string;
}) {
  return (
    <Box className="border-gray-4 border-l-2 py-0.5 pl-3">
      <Flex align="center" gap="2" className="text-gray-9">
        <XCircle size={14} />
        <Text size="1" color="gray">
          {getInterruptMessage(interruptReason)}
        </Text>
      </Flex>
    </Box>
  );
});
