import {
  type SourceProduct,
  useInboxSignalsFilterStore,
} from "@features/inbox/stores/inboxSignalsFilterStore";
import {
  inboxStatusAccentCss,
  inboxStatusLabel,
} from "@features/inbox/utils/inboxSort";
import {
  BrainIcon,
  BugIcon,
  CalendarPlus,
  Check,
  Clock,
  FunnelSimple as FunnelSimpleIcon,
  GithubLogoIcon,
  KanbanIcon,
  ListNumbers,
  MagnifyingGlass,
  TicketIcon,
  TrendUp,
  VideoIcon,
} from "@phosphor-icons/react";
import { Box, Flex, Popover, Text, TextField, Tooltip } from "@radix-ui/themes";
import type {
  SignalReportOrderingField,
  SignalReportStatus,
} from "@shared/types";

interface SignalsToolbarProps {
  totalCount: number;
  filteredCount: number;
  isSearchActive: boolean;
  livePolling?: boolean;
  readyCount?: number;
  processingCount?: number;
  searchDisabledReason?: string | null;
  hideFilters?: boolean;
}

type SortOption = {
  label: string;
  field: Extract<
    SignalReportOrderingField,
    "priority" | "created_at" | "total_weight"
  >;
  direction: "asc" | "desc";
  icon: React.ReactNode;
};

const sortOptions: SortOption[] = [
  {
    label: "Priority",
    field: "priority",
    direction: "asc",
    icon: <ListNumbers size={14} />,
  },
  {
    label: "Strongest signal",
    field: "total_weight",
    direction: "desc",
    icon: <TrendUp size={14} />,
  },
  {
    label: "Newest first",
    field: "created_at",
    direction: "desc",
    icon: <CalendarPlus size={14} />,
  },
  {
    label: "Oldest first",
    field: "created_at",
    direction: "asc",
    icon: <Clock size={14} />,
  },
];

const FILTERABLE_STATUSES: SignalReportStatus[] = [
  "ready",
  "pending_input",
  "in_progress",
  "candidate",
  "potential",
];

export function SignalsToolbar({
  totalCount,
  filteredCount,
  isSearchActive,
  livePolling = false,
  readyCount,
  processingCount = 0,
  searchDisabledReason,
  hideFilters,
}: SignalsToolbarProps) {
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const setSearchQuery = useInboxSignalsFilterStore((s) => s.setSearchQuery);
  const sortField = useInboxSignalsFilterStore((s) => s.sortField);
  const sortDirection = useInboxSignalsFilterStore((s) => s.sortDirection);
  const setSort = useInboxSignalsFilterStore((s) => s.setSort);
  const statusFilter = useInboxSignalsFilterStore((s) => s.statusFilter);
  const toggleStatus = useInboxSignalsFilterStore((s) => s.toggleStatus);
  const sourceProductFilter = useInboxSignalsFilterStore(
    (s) => s.sourceProductFilter,
  );
  const toggleSourceProduct = useInboxSignalsFilterStore(
    (s) => s.toggleSourceProduct,
  );

  const countLabel = isSearchActive
    ? `${filteredCount} of ${totalCount}`
    : `${totalCount}`;

  const pipelineHint =
    readyCount != null && processingCount > 0
      ? `${readyCount} ready · ${processingCount} in pipeline`
      : null;

  return (
    <Flex
      direction="column"
      gap="2"
      px="3"
      py="2"
      style={{ borderBottom: "1px solid var(--gray-5)" }}
    >
      <Flex align="center" justify="between" gap="2">
        <Flex direction="column" gap="0" className="min-w-0">
          <Flex align="center" gap="2">
            <Text size="1" color="gray" className="shrink-0 text-[12px]">
              Reports ({countLabel})
            </Text>
            {livePolling ? (
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{
                  backgroundColor: "var(--red-9)",
                  boxShadow: "0 0 8px var(--red-9)",
                  animation: "inboxToolbarPulse 1.4s ease-in-out infinite",
                }}
                title="Watching for new and updated reports"
                aria-hidden
              />
            ) : null}
          </Flex>
          {pipelineHint && !isSearchActive ? (
            <Text size="1" color="gray" className="text-[11px] opacity-80">
              {pipelineHint}
            </Text>
          ) : null}
        </Flex>
        {!hideFilters && (
          <FilterSortMenu
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={setSort}
            statusFilter={statusFilter}
            onToggleStatus={toggleStatus}
            sourceProductFilter={sourceProductFilter}
            onToggleSourceProduct={toggleSourceProduct}
          />
        )}
      </Flex>
      <Tooltip content={searchDisabledReason} hidden={!searchDisabledReason}>
        <TextField.Root
          size="1"
          placeholder="Search reports..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-[12px]"
          disabled={!!searchDisabledReason}
        >
          <TextField.Slot>
            <MagnifyingGlass size={12} />
          </TextField.Slot>
        </TextField.Root>
      </Tooltip>
    </Flex>
  );
}

const SOURCE_PRODUCT_OPTIONS: {
  value: SourceProduct;
  label: string;
  icon: React.ReactNode;
}[] = [
  {
    value: "session_replay",
    label: "Session replay",
    icon: <VideoIcon size={14} />,
  },
  {
    value: "error_tracking",
    label: "Error tracking",
    icon: <BugIcon size={14} />,
  },
  {
    value: "llm_analytics",
    label: "LLM analytics",
    icon: <BrainIcon size={14} />,
  },
  { value: "github", label: "GitHub", icon: <GithubLogoIcon size={14} /> },
  { value: "linear", label: "Linear", icon: <KanbanIcon size={14} /> },
  { value: "zendesk", label: "Zendesk", icon: <TicketIcon size={14} /> },
];

function FilterSortMenu({
  sortField,
  sortDirection,
  onSort,
  statusFilter,
  onToggleStatus,
  sourceProductFilter,
  onToggleSourceProduct,
}: {
  sortField: string;
  sortDirection: string;
  onSort: (
    field: SortOption["field"],
    direction: SortOption["direction"],
  ) => void;
  statusFilter: SignalReportStatus[];
  onToggleStatus: (status: SignalReportStatus) => void;
  sourceProductFilter: SourceProduct[];
  onToggleSourceProduct: (source: SourceProduct) => void;
}) {
  const itemClassName =
    "flex w-full items-center justify-between rounded-sm px-1 py-1 text-left text-[13px] text-gray-12 transition-colors hover:bg-gray-3";

  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          aria-label="Filter and sort signals"
          className="flex h-6 w-6 items-center justify-center rounded-sm text-gray-10 transition-colors hover:bg-gray-3 hover:text-gray-12"
        >
          <FunnelSimpleIcon size={14} />
        </button>
      </Popover.Trigger>
      <Popover.Content
        align="end"
        side="bottom"
        sideOffset={6}
        style={{ padding: 8, minWidth: 220 }}
      >
        <Flex direction="column" gap="3">
          <Box>
            <Text
              size="1"
              className="text-gray-10"
              weight="medium"
              style={{ paddingLeft: "1px" }}
            >
              Sort by
            </Text>
            <Box mt="1">
              {sortOptions.map((option) => {
                const isActive =
                  sortField === option.field &&
                  sortDirection === option.direction;
                return (
                  <button
                    key={`${option.field}-${option.direction}`}
                    type="button"
                    className={itemClassName}
                    onClick={() => onSort(option.field, option.direction)}
                  >
                    <span className="flex items-center gap-1 text-gray-12">
                      {option.icon}
                      <span>{option.label}</span>
                    </span>
                    {isActive && <Check size={12} className="text-gray-12" />}
                  </button>
                );
              })}
            </Box>
          </Box>

          <Box>
            <Text
              size="1"
              className="text-gray-10"
              weight="medium"
              style={{ paddingLeft: "1px" }}
            >
              Status
            </Text>
            <Box mt="1">
              {FILTERABLE_STATUSES.map((status) => {
                const isActive = statusFilter.includes(status);
                const accent = inboxStatusAccentCss(status);
                return (
                  <button
                    key={status}
                    type="button"
                    className={itemClassName}
                    onClick={() => onToggleStatus(status)}
                  >
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: accent }}
                      />
                      <span className="text-gray-12">
                        {inboxStatusLabel(status)}
                      </span>
                    </span>
                    {isActive && <Check size={12} className="text-gray-12" />}
                  </button>
                );
              })}
            </Box>
          </Box>

          <Box>
            <Text
              size="1"
              className="text-gray-10"
              weight="medium"
              style={{ paddingLeft: "1px" }}
            >
              Source
            </Text>
            <Box mt="1">
              {SOURCE_PRODUCT_OPTIONS.map((option) => {
                const isActive = sourceProductFilter.includes(option.value);
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={itemClassName}
                    onClick={() => onToggleSourceProduct(option.value)}
                  >
                    <span className="flex items-center gap-1 text-gray-12">
                      {option.icon}
                      <span>{option.label}</span>
                    </span>
                    {isActive && <Check size={12} className="text-gray-12" />}
                  </button>
                );
              })}
            </Box>
          </Box>
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
