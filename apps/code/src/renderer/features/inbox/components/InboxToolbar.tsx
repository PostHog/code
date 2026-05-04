import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import { useInboxViewStore } from "@features/inbox/stores/inboxViewStore";
import { INBOX_REFETCH_INTERVAL_MS } from "@features/inbox/utils/inboxConstants";
import { GearSixIcon } from "@phosphor-icons/react";
import { Tooltip } from "@radix-ui/themes";
import { useCallback } from "react";
import { ScopeToggle } from "./ScopeToggle";
import { SortDropdown } from "./SortDropdown";
import { TabPills } from "./TabPills";

interface InboxToolbarProps {
  prCount: number;
  reportCount: number;
  forYouCount: number;
  allCount: number;
  livePolling?: boolean;
  isFetching?: boolean;
  onConfigureSources?: () => void;
}

const livePollingTooltip = `Inbox is focused \u2013 syncing every ${Math.round(INBOX_REFETCH_INTERVAL_MS / 1000)}s\u2026`;

export function InboxToolbar({
  prCount,
  reportCount,
  forYouCount,
  allCount,
  livePolling = false,
  isFetching = false,
  onConfigureSources,
}: InboxToolbarProps) {
  const activeTab = useInboxViewStore((s) => s.activeTab);
  const scope = useInboxViewStore((s) => s.scope);
  const sort = useInboxViewStore((s) => s.sort);
  const setActiveTab = useInboxViewStore((s) => s.setActiveTab);
  const setScope = useInboxViewStore((s) => s.setScope);
  const setSort = useInboxViewStore((s) => s.setSort);
  const setSuggestedReviewerFilter = useInboxSignalsFilterStore(
    (s) => s.setSuggestedReviewerFilter,
  );

  const handleScopeChange = useCallback(
    (newScope: "for-you" | "all") => {
      setScope(newScope);
      if (newScope === "all") {
        setSuggestedReviewerFilter([]);
      }
    },
    [setScope, setSuggestedReviewerFilter],
  );

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-b-(--gray-5) py-2">
      {/* Left group: tabs + live dot */}
      <div className="flex items-center gap-2">
        <TabPills
          activeTab={activeTab}
          prCount={prCount}
          reportCount={reportCount}
          onTabChange={setActiveTab}
        />

        {/* Live polling indicator */}
        {livePolling && (
          <Tooltip content={livePollingTooltip}>
            <span
              role="img"
              className="inline-flex h-1.5 w-1.5 shrink-0 cursor-default rounded-full bg-(--red-9)"
              style={{
                boxShadow: isFetching
                  ? "0 0 6px var(--red-9)"
                  : "0 0 4px var(--red-9)",
                opacity: isFetching ? 1 : 0.6,
                transform: isFetching ? "scale(1.05)" : "scale(0.92)",
                transition: isFetching
                  ? "opacity 0.15s ease-out, transform 0.15s ease-out, box-shadow 0.15s ease-out"
                  : "opacity 0.6s ease-in, transform 0.6s ease-in, box-shadow 0.6s ease-in",
              }}
              aria-label="Live inbox refresh active"
            />
          </Tooltip>
        )}
      </div>

      {/* Divider — hidden when wrapping */}
      <div className="hidden h-4 w-px bg-(--gray-5) sm:block" />

      {/* Right group: scope + sort — wraps below tabs on narrow widths */}
      <div className="flex items-center gap-3">
        <ScopeToggle
          scope={scope}
          forYouCount={forYouCount}
          allCount={allCount}
          onScopeChange={handleScopeChange}
        />
        <div className="h-4 w-px bg-(--gray-5)" />
        <SortDropdown sort={sort} onSortChange={setSort} />
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Configure sources */}
      {onConfigureSources && (
        <button
          type="button"
          onClick={onConfigureSources}
          className="flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-gray-10 hover:text-gray-12"
        >
          <GearSixIcon size={12} />
          <span className="hidden sm:inline">Configure sources</span>
        </button>
      )}
    </div>
  );
}
