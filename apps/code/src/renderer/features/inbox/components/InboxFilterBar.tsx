import {
  type SourceProduct,
  useInboxSignalsFilterStore,
} from "@features/inbox/stores/inboxSignalsFilterStore";
import type { InboxTab } from "@features/inbox/stores/inboxViewStore";
import {
  inboxStatusAccentCss,
  inboxStatusLabel,
} from "@features/inbox/utils/inboxSort";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { DropdownMenu } from "@radix-ui/themes";
import type { SignalReportStatus } from "@shared/types";
import { SOURCE_PRODUCT_META } from "./utils/source-product-icons";

interface InboxFilterBarProps {
  activeTab: InboxTab;
  sourceCountsMap: Record<string, number>;
}

const SOURCE_PRODUCTS = Object.keys(SOURCE_PRODUCT_META) as SourceProduct[];

const FILTERABLE_STATUSES: SignalReportStatus[] = [
  "ready",
  "pending_input",
  "in_progress",
  "failed",
  "candidate",
  "potential",
];

export function InboxFilterBar({
  activeTab,
  sourceCountsMap,
}: InboxFilterBarProps) {
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const setSearchQuery = useInboxSignalsFilterStore((s) => s.setSearchQuery);
  const sourceProductFilter = useInboxSignalsFilterStore(
    (s) => s.sourceProductFilter,
  );
  const toggleSourceProduct = useInboxSignalsFilterStore(
    (s) => s.toggleSourceProduct,
  );
  const statusFilter = useInboxSignalsFilterStore((s) => s.statusFilter);
  const toggleStatus = useInboxSignalsFilterStore((s) => s.toggleStatus);

  const activeSourceLabel =
    sourceProductFilter.length === 0
      ? "All sources"
      : sourceProductFilter.length === 1
        ? (SOURCE_PRODUCT_META[sourceProductFilter[0]]?.label ??
          sourceProductFilter[0])
        : `${sourceProductFilter.length} sources`;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-b-(--gray-5) py-2">
      {/* Search input */}
      <div className="flex min-w-[140px] flex-1 items-center gap-1.5 text-(--gray-9) sm:max-w-[240px] sm:flex-none">
        <MagnifyingGlass size={13} className="shrink-0" />
        <input
          type="text"
          placeholder="Search by title or description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded border-none bg-transparent text-(--gray-12) text-[12px] outline-none placeholder:text-(--gray-8) focus:ring-1 focus:ring-amber-6"
        />
      </div>

      {/* Source dropdown */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-(--gray-9) text-[10px] uppercase tracking-wide">
          Source
        </span>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button
              type="button"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-(--gray-11) text-[12px] hover:bg-(--gray-3)"
            >
              {activeSourceLabel}
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content
            align="start"
            size="1"
            style={{ minWidth: 180 }}
          >
            {SOURCE_PRODUCTS.map((source) => {
              const meta = SOURCE_PRODUCT_META[source];
              if (!meta) return null;
              const count = sourceCountsMap[source] ?? 0;
              const isActive = sourceProductFilter.includes(source);

              return (
                <DropdownMenu.CheckboxItem
                  key={source}
                  checked={isActive}
                  onCheckedChange={() => toggleSourceProduct(source)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="flex items-center gap-1.5">
                    <span style={{ color: meta.color }}>
                      <meta.Icon size={13} />
                    </span>
                    <span>{meta.label}</span>
                    <span className="ml-auto font-mono text-(--gray-9) text-[10px]">
                      {count}
                    </span>
                  </span>
                </DropdownMenu.CheckboxItem>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      </div>

      {/* Status filter chips — Reports tab only */}
      {activeTab === "reports" && (
        <>
          <div className="h-4 w-px bg-(--gray-5)" />
          <div className="flex flex-wrap items-center gap-1">
            {FILTERABLE_STATUSES.map((status) => {
              const isActive = statusFilter.includes(status);
              const accent = inboxStatusAccentCss(status);

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => toggleStatus(status)}
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-medium text-[11px] transition-none ${
                    isActive
                      ? "text-(--gray-12)"
                      : "text-(--gray-9) hover:text-(--gray-11)"
                  }`}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: accent,
                      opacity: isActive ? 1 : 0.4,
                    }}
                  />
                  <span>{inboxStatusLabel(status)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
