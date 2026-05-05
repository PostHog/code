import { CHAT_CONTENT_MAX_WIDTH } from "@features/sessions/constants";
import { useContextUsage } from "@features/sessions/hooks/useContextUsage";
import {
  sessionStoreSetters,
  useOptimisticItemsForTask,
  usePendingPermissionsForTask,
  useQueuedMessagesForTask,
  useSessionForTask,
} from "@features/sessions/stores/sessionStore";
import { extractSearchableText } from "@features/sessions/utils/extractSearchableText";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { SkillButtonActionMessage } from "@features/skill-buttons/components/SkillButtonActionMessage";
import { ArrowDown, XCircle } from "@phosphor-icons/react";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import WorkerUrl from "@pierre/diffs/worker/worker.js?worker&url";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type { AcpMessage } from "@shared/types/session-events";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildConversationItems,
  type ConversationItem,
  type TurnContext,
} from "./buildConversationItems";
import { ConversationSearchBar } from "./ConversationSearchBar";
import { GitActionMessage } from "./GitActionMessage";
import { GitActionResult } from "./GitActionResult";
import { mergeConversationItems } from "./mergeConversationItems";
import { SessionFooter } from "./SessionFooter";
import { QueuedMessageView } from "./session-update/QueuedMessageView";
import {
  type RenderItem,
  SessionUpdateView,
} from "./session-update/SessionUpdateView";
import { UserMessage } from "./session-update/UserMessage";
import { UserShellExecuteView } from "./session-update/UserShellExecuteView";
import { VirtualizedList, type VirtualizedListHandle } from "./VirtualizedList";

function diffsWorkerFactory(): Worker {
  return new Worker(WorkerUrl, { type: "module" });
}

const DIFFS_POOL_OPTIONS = {
  workerFactory: diffsWorkerFactory,
  totalASTLRUCacheSize: 200,
};

const DIFFS_HIGHLIGHTER_OPTIONS = {
  theme: { dark: "github-dark" as const, light: "github-light" as const },
};

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
  const isAtBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const debugLogsCloudRuns = useSettingsStore((s) => s.debugLogsCloudRuns);
  const showDebugLogs = debugLogsCloudRuns;
  const contextUsage = useContextUsage(events);

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

  const [initialItemIds] = useState(
    () =>
      new Set(
        conversationItems
          .filter((i) => i.type === "user_message")
          .map((i) => i.id),
      ),
  );

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

  const isCloud = session?.isCloud ?? false;

  const items = useMemo<ConversationItem[]>(
    () =>
      mergeConversationItems({
        conversationItems,
        optimisticItems,
        queuedItems,
        isCloud,
      }),
    [conversationItems, optimisticItems, queuedItems, isCloud],
  );

  // Keep MCP App tool call items mounted so their iframes and bridges
  // survive scrolling out of the virtualized viewport.
  const mcpAppIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type !== "session_update") continue;
      const update = item.update;
      if (!("_meta" in update)) continue;
      const meta = update._meta as
        | { claudeCode?: { toolName?: string } }
        | undefined;
      if (meta?.claudeCode?.toolName?.startsWith("mcp__")) {
        indices.push(i);
      }
    }
    return indices;
  }, [items]);

  // --- Cmd+F search ---
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Per-occurrence matching: each match tracks its item for scrolling
  const searchMatches = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    const matches: { itemIndex: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const text = extractSearchableText(items[i]).toLowerCase();
      let start = 0;
      while (start < text.length) {
        const idx = text.indexOf(q, start);
        if (idx === -1) break;
        matches.push({ itemIndex: i });
        start = idx + 1;
      }
    }
    return matches;
  }, [items, searchQuery]);

  const handleSearchQueryChange = useCallback((q: string) => {
    setSearchQuery(q);
    setCurrentMatchIndex(0);
  }, []);

  const handleSearchNext = useCallback(() => {
    if (searchMatches.length === 0) return;
    const next = (currentMatchIndex + 1) % searchMatches.length;
    setCurrentMatchIndex(next);
    listRef.current?.scrollToIndex(searchMatches[next].itemIndex);
  }, [searchMatches, currentMatchIndex]);

  const handleSearchPrev = useCallback(() => {
    if (searchMatches.length === 0) return;
    const prev =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    setCurrentMatchIndex(prev);
    listRef.current?.scrollToIndex(searchMatches[prev].itemIndex);
  }, [searchMatches, currentMatchIndex]);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery("");
    setCurrentMatchIndex(0);
    if (CSS?.highlights) {
      CSS.highlights.delete("search-match");
      CSS.highlights.delete("search-match-active");
    }
  }, []);

  // Scroll to first match when query changes
  useEffect(() => {
    if (searchMatches.length > 0 && searchQuery) {
      listRef.current?.scrollToIndex(searchMatches[0].itemIndex);
    }
  }, [searchMatches, searchQuery]);

  // CSS Highlight API: highlight matching text in visible DOM
  useEffect(() => {
    if (typeof CSS === "undefined" || !CSS.highlights) return;
    if (!searchQuery || !containerRef.current) {
      CSS.highlights.delete("search-match");
      CSS.highlights.delete("search-match-active");
      return;
    }

    const container = containerRef.current;
    const activeMatch =
      searchMatches.length > 0 ? searchMatches[currentMatchIndex] : null;

    // Build set of item indices that have data-model matches so the DOM
    // walker only highlights text inside those items (keeps count in sync).
    const matchingItemIndices = new Set(searchMatches.map((m) => m.itemIndex));

    function applyHighlights() {
      CSS.highlights.delete("search-match");
      CSS.highlights.delete("search-match-active");

      const q = searchQuery.toLowerCase();
      const allRanges: Range[] = [];

      const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);

      while (walker.nextNode()) {
        const node = walker.currentNode;

        // Only highlight inside items the data model identified as matches
        const itemEl = (node.parentElement as HTMLElement | null)?.closest(
          "[data-conversation-item]",
        );
        if (itemEl) {
          const idx = Number(itemEl.getAttribute("data-conversation-item"));
          if (!matchingItemIndices.has(idx)) continue;
        }

        const text = node.textContent?.toLowerCase() ?? "";

        let start = 0;
        while (start < text.length) {
          const idx = text.indexOf(q, start);
          if (idx === -1) break;
          const range = new Range();
          range.setStart(node, idx);
          range.setEnd(node, idx + searchQuery.length);
          allRanges.push(range);
          start = idx + 1;
        }
      }

      if (allRanges.length > 0) {
        CSS.highlights.set("search-match", new Highlight(...allRanges));
      }

      // The active match is identified by finding DOM ranges that belong
      // to the target item and picking the right occurrence within it.
      // Count occurrences per-item in DOM order to find the correct one.
      if (activeMatch && allRanges.length > 0) {
        const targetItem = activeMatch.itemIndex;
        // Find which DOM-occurrence within this item we need
        let targetOccInItem = 0;
        for (let i = 0; i < currentMatchIndex; i++) {
          if (searchMatches[i].itemIndex === targetItem) {
            targetOccInItem++;
          }
        }
        // Walk DOM ranges to find the Nth occurrence in the target item
        let occInItem = 0;
        for (const range of allRanges) {
          const itemEl = range.startContainer.parentElement?.closest(
            "[data-conversation-item]",
          );
          const itemIdx = itemEl
            ? Number(itemEl.getAttribute("data-conversation-item"))
            : -1;
          if (itemIdx === targetItem) {
            if (occInItem === targetOccInItem) {
              CSS.highlights.set("search-match-active", new Highlight(range));
              return;
            }
            occInItem++;
          }
        }
      }
    }

    // Run immediately, then retry after short delays so the active
    // highlight appears even when the virtualized list is still
    // scrolling/rendering the target item into view.
    applyHighlights();
    let cancelled = false;
    const retryDelays = activeMatch ? [50, 150, 300] : [];
    const timeouts = retryDelays.map((ms) =>
      setTimeout(() => {
        if (!cancelled) applyHighlights();
      }, ms),
    );

    // Reapply highlights on scroll since the virtualized list recycles
    // DOM nodes — items entering the viewport need fresh highlights.
    const onScroll = () => {
      if (!cancelled) applyHighlights();
    };
    container.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });

    return () => {
      cancelled = true;
      for (const id of timeouts) clearTimeout(id);
      container.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [searchQuery, searchMatches, currentMatchIndex]);

  // Cmd+F keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        e.stopImmediatePropagation();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, []);
  // --- End search ---

  const handleScrollStateChange = useCallback((isAtBottom: boolean) => {
    isAtBottomRef.current = isAtBottom;
    setShowScrollButton(!isAtBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    listRef.current?.scrollToBottom();
    setShowScrollButton(false);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && isAtBottomRef.current) {
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
              attachments={item.attachments}
              timestamp={item.timestamp}
              animate={!initialItemIds.has(item.id)}
              sourceUrl={
                slackThreadUrl && item.id === firstUserMessageId
                  ? slackThreadUrl
                  : undefined
              }
            />
          );
        case "git_action":
          return <GitActionMessage actionType={item.actionType} />;
        case "skill_button_action":
          return <SkillButtonActionMessage buttonId={item.buttonId} />;
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
    [repoPath, taskId, slackThreadUrl, firstUserMessageId, initialItemIds],
  );

  const getItemKey = useCallback((item: ConversationItem) => item.id, []);

  return (
    <WorkerPoolContextProvider
      poolOptions={DIFFS_POOL_OPTIONS}
      highlighterOptions={DIFFS_HIGHLIGHTER_OPTIONS}
    >
      <div ref={containerRef} className="relative flex-1">
        <div
          id="fullscreen-portal"
          className="pointer-events-none absolute inset-0 z-20"
        />
        {searchOpen && (
          <ConversationSearchBar
            query={searchQuery}
            currentMatch={currentMatchIndex}
            totalMatches={searchMatches.length}
            onQueryChange={handleSearchQueryChange}
            onNext={handleSearchNext}
            onPrev={handleSearchPrev}
            onClose={handleSearchClose}
          />
        )}

        <VirtualizedList
          ref={listRef}
          items={items}
          getItemKey={getItemKey}
          renderItem={renderItem}
          onScrollStateChange={handleScrollStateChange}
          keepMounted={mcpAppIndices}
          className="absolute inset-0 bg-background"
          itemClassName="mx-auto px-2 py-1.5"
          itemStyle={{ maxWidth: CHAT_CONTENT_MAX_WIDTH }}
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
                usage={contextUsage}
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
    </WorkerPoolContextProvider>
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
        <Text color="gray" className="text-[13px]">
          {message}
        </Text>
      </Flex>
    </Box>
  );
});
