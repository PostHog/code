import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import {
  CalendarPlus,
  Check,
  Clock,
  FunnelSimple as FunnelSimpleIcon,
  MagnifyingGlass,
  TrendUp,
} from "@phosphor-icons/react";
import { Box, Flex, Popover, Text, TextField } from "@radix-ui/themes";
import type { SignalReportOrderingField } from "@shared/types";

interface SignalsToolbarProps {
  totalCount: number;
  filteredCount: number;
  isSearchActive: boolean;
  livePolling?: boolean;
  readyCount?: number;
  processingCount?: number;
}

type SortOption = {
  label: string;
  field: Extract<SignalReportOrderingField, "created_at" | "total_weight">;
  direction: "asc" | "desc";
  icon: React.ReactNode;
};

const sortOptions: SortOption[] = [
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

export function SignalsToolbar({
  totalCount,
  filteredCount,
  isSearchActive,
  livePolling = false,
  readyCount,
  processingCount = 0,
}: SignalsToolbarProps) {
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const setSearchQuery = useInboxSignalsFilterStore((s) => s.setSearchQuery);
  const sortField = useInboxSignalsFilterStore((s) => s.sortField);
  const sortDirection = useInboxSignalsFilterStore((s) => s.sortDirection);
  const setSort = useInboxSignalsFilterStore((s) => s.setSort);

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
        <Flex align="center" gap="2" className="min-w-0">
          {livePolling ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor: "var(--amber-9)",
                boxShadow: "0 0 10px var(--amber-9)",
                animation: "inboxToolbarPulse 1.4s ease-in-out infinite",
              }}
              title="Watching for new and updated reports"
              aria-hidden
            />
          ) : null}
          <Flex direction="column" gap="0" className="min-w-0">
            <Text size="1" color="gray" className="shrink-0 text-[11px]">
              Signals ({countLabel})
            </Text>
            {pipelineHint && !isSearchActive ? (
              <Text size="1" color="gray" className="text-[10px] opacity-80">
                {pipelineHint}
              </Text>
            ) : null}
          </Flex>
        </Flex>
        <SortMenu
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={setSort}
        />
      </Flex>
      <TextField.Root
        size="1"
        placeholder="Search signals..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="text-[11px]"
      >
        <TextField.Slot>
          <MagnifyingGlass size={12} />
        </TextField.Slot>
      </TextField.Root>
    </Flex>
  );
}

function SortMenu({
  sortField,
  sortDirection,
  onSort,
}: {
  sortField: string;
  sortDirection: string;
  onSort: (
    field: SortOption["field"],
    direction: SortOption["direction"],
  ) => void;
}) {
  const itemClassName =
    "flex w-full items-center justify-between rounded-sm px-1 py-1 text-left text-[12px] text-gray-12 transition-colors hover:bg-gray-3";

  return (
    <Popover.Root>
      <Popover.Trigger>
        <button
          type="button"
          aria-label="Sort signals"
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
        <Flex direction="column" gap="1">
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
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
}
