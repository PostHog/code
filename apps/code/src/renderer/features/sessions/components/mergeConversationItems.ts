import type { ConversationItem } from "./buildConversationItems";

type QueuedItem = Extract<ConversationItem, { type: "queued" }>;

interface MergeConversationItemsArgs {
  conversationItems: ConversationItem[];
  optimisticItems: ConversationItem[];
  queuedItems: QueuedItem[];
  isCloud: boolean;
}

// Cloud's initial optimistic is pinned to the top so the user's prompt stays
// visible above setup progress. When the agent echoes it back via
// `session/prompt`, the duplicate `user_message` is filtered out by content
// match so the bubble doesn't disappear-then-reappear when the echo lands.
//
// Local sessions keep optimistic at the chronological end — they rely on
// `replaceOptimisticWithEvent` to swap optimistic↔real in place.
export function mergeConversationItems({
  conversationItems,
  optimisticItems,
  queuedItems,
  isCloud,
}: MergeConversationItemsArgs): ConversationItem[] {
  if (!isCloud) {
    const result: ConversationItem[] = [
      ...conversationItems,
      ...optimisticItems,
    ];
    return queuedItems.length > 0 ? [...result, ...queuedItems] : result;
  }

  const optimisticUserContents = new Set(
    optimisticItems
      .filter(
        (item): item is Extract<typeof item, { type: "user_message" }> =>
          item.type === "user_message",
      )
      .map((item) => item.content),
  );
  const dedupedConversation =
    optimisticUserContents.size === 0
      ? conversationItems
      : conversationItems.filter((item) => {
          if (item.type !== "user_message") return true;
          return !optimisticUserContents.has(item.content);
        });
  const result: ConversationItem[] = [
    ...optimisticItems,
    ...dedupedConversation,
  ];
  return queuedItems.length > 0 ? [...result, ...queuedItems] : result;
}
