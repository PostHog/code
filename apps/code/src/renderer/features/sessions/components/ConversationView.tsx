import {
  sessionStoreSetters,
  useOptimisticItemsForTask,
  usePendingPermissionsForTask,
  useQueuedMessagesForTask,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
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
  isPromptPending: boolean | null;
  promptStartedAt?: number | null;
  repoPath?: string | null;
  taskId?: string;
  slackThreadUrl?: string;
  compact?: boolean;
}

export function ConversationView({
  events,
  isPromptPending,
  promptStartedAt,
  repoPath,
  taskId,
  slackThreadUrl,
  compact = false,
}: ConversationViewProps) {
  const listRef = useRef<VirtualizedListHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const agentLogsEnabled = useFeatureFlag("posthog-code-background-agent-logs");
  const debugLogsCloudRuns = useSettingsStore((s) => s.debugLogsCloudRuns);
  const showDebugLogs = agentLogsEnabled && debugLogsCloudRuns;

  const {
    items: conversationItems,
    lastTurnInfo,
    isCompacting,
  } = useMemo(
    () =>
      buildConversationItems(events, isPromptPending, {
        showDebugLogs,
      }),
    [events, isPromptPending, showDebugLogs],
  );

  const firstUserMessageIdRef = useRef<string | undefined>(undefined);
  if (firstUserMessageIdRef.current === undefined) {
    firstUserMessageIdRef.current = conversationItems.find(
      (i) => i.type === "user_message",
    )?.id;
  }
  const firstUserMessageId = firstUserMessageIdRef.current;

  const pendingPermissions = usePendingPermissionsForTask(taskId ?? "");
  const pendingPermissionsCount = pendingPermissions.size;
  const queuedMessages = useQueuedMessagesForTask(taskId);
  const optimisticItems = useOptimisticItemsForTask(taskId);
  const session = useSessionForTask(taskId);
  const pausedDurationMs = session?.pausedDurationMs ?? 0;

  const queuedItems = useMemo<Extract<ConversationItem, { type: "queued" }>[]>(
    () =>
      queuedMessages.map((msg) => ({
        type: "queued" as const,
        id: msg.id,
        message: msg,
      })),
    [queuedMessages],
  );

  const items = useMemo<ConversationItem[]>(() => {
    const result: ConversationItem[] = [
      ...conversationItems,
      ...optimisticItems,
    ];
    return queuedItems.length > 0 ? [...result, ...queuedItems] : result;
  }, [conversationItems, optimisticItems, queuedItems]);

  const handleScrollStateChange = useCallback((isAtBottom: boolean) => {
    setShowScrollButton(!isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToBottom();
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        listRef.current?.scrollToBottom();
        setShowScrollButton(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  const renderItem = useCallback(
    (item: ConversationItem) => {
      switch (item.type) {
        case "user_message":
          return (
            <UserMessage
              content={item.content}
              timestamp={item.timestamp}
              sourceUrl={
                slackThreadUrl && item.id === firstUserMessageId
                  ? slackThreadUrl
                  : undefined
              }
            />
          );
        case "git_action":
          return <GitActionMessage actionType={item.actionType} />;
        case "session_update":
          return (
            <SessionUpdateRow
              update={item.update}
              turnContext={item.turnContext}
              thoughtComplete={item.thoughtComplete}
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
    [repoPath, taskId, slackThreadUrl, firstUserMessageId],
  );

  const getItemKey = useCallback((item: ConversationItem) => item.id, []);

  return (
    <div className="relative flex-1">
      <VirtualizedList
        ref={listRef}
        items={items}
        getItemKey={getItemKey}
        renderItem={renderItem}
        onScrollStateChange={handleScrollStateChange}
        className="absolute inset-0 bg-gray-1"
        itemClassName="mx-auto max-w-[750px] px-2 py-1.5"
        footer={
          <div className={compact ? "pb-1" : "pb-16"}>
            <SessionFooter
              isPromptPending={isPromptPending}
              promptStartedAt={promptStartedAt}
              lastGenerationDuration={
                lastTurnInfo?.isComplete
                  ? Math.max(0, lastTurnInfo.durationMs - pausedDurationMs)
                  : null
              }
              lastStopReason={lastTurnInfo?.stopReason}
              queuedCount={queuedMessages.length}
              hasPendingPermission={pendingPermissionsCount > 0}
              pausedDurationMs={pausedDurationMs}
              isCompacting={isCompacting}
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
  thoughtComplete,
}: {
  update: RenderItem;
  turnContext: TurnContext;
  thoughtComplete?: boolean;
}) {
  return (
    <SessionUpdateView
      item={update}
      toolCalls={turnContext.toolCalls}
      childItems={turnContext.childItems}
      turnCancelled={turnContext.turnCancelled}
      turnComplete={turnContext.turnComplete}
      thoughtComplete={thoughtComplete}
    />
  );
});

const TurnCancelledView = memo(function TurnCancelledView({
  interruptReason,
}: {
  interruptReason?: string;
}) {
  const message =
    interruptReason === "moving_to_worktree"
      ? "Paused while worktree is focused"
      : "Interrupted by user";

  return (
    <Box className="border-gray-4 border-l-2 py-0.5 pl-3">
      <Flex align="center" gap="2" className="text-gray-9">
        <XCircle size={14} />
        <Text size="1" color="gray">
          {message}
        </Text>
      </Flex>
    </Box>
  );
});
