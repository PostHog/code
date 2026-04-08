import { useInboxBulkActions } from "@features/inbox/hooks/useInboxBulkActions";
import { useInboxReportSelectionStore } from "@features/inbox/stores/inboxReportSelectionStore";
import {
  type SourceProduct,
  useInboxSignalsFilterStore,
} from "@features/inbox/stores/inboxSignalsFilterStore";
import {
  inboxStatusAccentCss,
  inboxStatusLabel,
} from "@features/inbox/utils/inboxSort";
import {
  ArrowClockwiseIcon,
  BrainIcon,
  BugIcon,
  CalendarPlus,
  Check,
  Clock,
  EyeSlashIcon,
  FunnelSimple as FunnelSimpleIcon,
  GithubLogoIcon,
  KanbanIcon,
  ListNumbers,
  MagnifyingGlass,
  PauseIcon,
  TicketIcon,
  TrashIcon,
  TrendUp,
  VideoIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Box,
  Button,
  Checkbox,
  Flex,
  Popover,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { IS_DEV } from "@shared/constants/environment";
import type {
  SignalReport,
  SignalReportOrderingField,
  SignalReportStatus,
} from "@shared/types";
import { type KeyboardEvent, useState } from "react";

interface SignalsToolbarProps {
  totalCount: number;
  filteredCount: number;
  isSearchActive: boolean;
  livePolling?: boolean;
  readyCount?: number;
  processingCount?: number;
  searchDisabledReason?: string | null;
  hideFilters?: boolean;
  reports?: SignalReport[];
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
  reports = [],
}: SignalsToolbarProps) {
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const setSearchQuery = useInboxSignalsFilterStore((s) => s.setSearchQuery);
  const [showSuppressConfirm, setShowSuppressConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const selectedReportIds = useInboxReportSelectionStore(
    (s) => s.selectedReportIds ?? [],
  );
  const setSelectedReportIds = useInboxReportSelectionStore(
    (s) => s.setSelectedReportIds,
  );

  const {
    selectedCount,
    canSuppress,
    canSnooze,
    canDelete,
    canReingest,
    isSuppressing,
    isSnoozing,
    isDeleting,
    isReingesting,
    suppressSelected,
    snoozeSelected,
    deleteSelected,
    reingestSelected,
  } = useInboxBulkActions(reports);

  const countLabel = isSearchActive
    ? `${filteredCount} of ${totalCount}`
    : `${totalCount}`;

  const pipelineHint =
    readyCount != null && processingCount > 0
      ? `${readyCount} ready · ${processingCount} in pipeline`
      : null;

  const handleConfirmSuppress = async () => {
    const ok = await suppressSelected();
    if (ok) {
      setShowSuppressConfirm(false);
    }
  };

  const handleConfirmDelete = async () => {
    const ok = await deleteSelected();
    if (ok) {
      setShowDeleteConfirm(false);
    }
  };

  const handleSnooze = async () => {
    await snoozeSelected();
  };

  const handleReingest = async () => {
    await reingestSelected();
  };

  const visibleReportIds = reports.map((report) => report.id);
  const hasVisibleReports = visibleReportIds.length > 0;
  const selectedVisibleCount = visibleReportIds.filter((reportId) =>
    selectedReportIds.includes(reportId),
  ).length;
  const allVisibleSelected =
    hasVisibleReports && selectedVisibleCount === visibleReportIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleReportIds.length;

  const handleToggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReportIds(visibleReportIds);
    } else {
      setSelectedReportIds([]);
    }
  };

  return (
    <>
      <Flex
        direction="column"
        gap="2"
        style={{ padding: "8px", borderBottom: "1px solid var(--gray-5)" }}
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
          {!hideFilters && <FilterSortMenu />}
        </Flex>

        <Flex align="start" gap="2">
          <Flex align="center" justify="center" className="shrink-0 pt-0.5">
            <Checkbox
              size="1"
              checked={
                someVisibleSelected ? "indeterminate" : allVisibleSelected
              }
              disabled={!hasVisibleReports}
              onCheckedChange={(checked) =>
                handleToggleSelectAll(checked === true)
              }
              aria-label="Select all visible reports"
            />
          </Flex>
          <Tooltip
            content={searchDisabledReason}
            hidden={!searchDisabledReason}
          >
            <Box style={{ flex: 1, minWidth: 0 }}>
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
            </Box>
          </Tooltip>
        </Flex>

        {selectedCount > 0 && (
          <Flex direction="column" gap="1">
            <Flex align="center" justify="between" gap="2" wrap="wrap">
              <Text size="1" color="gray" className="text-[11px]">
                {selectedCount} selected
              </Text>
            </Flex>

            <Flex gap="1" wrap="wrap">
              <Tooltip content="Wait for this report to gather more context">
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="text-[12px]"
                  disabled={!canSnooze || isSnoozing}
                  onClick={() => void handleSnooze()}
                >
                  {isSnoozing ? <Spinner size="1" /> : <PauseIcon size={12} />}
                  Snooze
                </Button>
              </Tooltip>

              <Button
                size="1"
                variant="soft"
                color="red"
                className="text-[12px]"
                disabled={!canDelete || isDeleting}
                onClick={() => setShowDeleteConfirm(true)}
              >
                {isDeleting ? <Spinner size="1" /> : <TrashIcon size={12} />}
                Delete
              </Button>

              <Button
                size="1"
                variant="soft"
                color="red"
                className="text-[12px]"
                disabled={!canSuppress || isSuppressing}
                onClick={() => setShowSuppressConfirm(true)}
              >
                {isSuppressing ? (
                  <Spinner size="1" />
                ) : (
                  <EyeSlashIcon size={12} />
                )}
                Suppress
              </Button>

              {IS_DEV && (
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="text-[12px]"
                  disabled={!canReingest || isReingesting}
                  onClick={() => void handleReingest()}
                >
                  {isReingesting ? (
                    <Spinner size="1" />
                  ) : (
                    <ArrowClockwiseIcon size={12} />
                  )}
                  Reingest
                </Button>
              )}
            </Flex>
          </Flex>
        )}
      </Flex>

      <AlertDialog.Root
        open={showSuppressConfirm}
        onOpenChange={setShowSuppressConfirm}
      >
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>
            <Flex align="center" gap="2">
              <EyeSlashIcon size={18} />
              <Text weight="bold">Suppress reports</Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Text className="text-[13px]">
              Suppressing a report causes all future signals matched to that
              report to be ignored. Are you sure?
            </Text>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={() => void handleConfirmSuppress()}
                disabled={isSuppressing}
              >
                {isSuppressing ? (
                  <Spinner size="1" />
                ) : (
                  <EyeSlashIcon size={14} />
                )}
                Suppress
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <AlertDialog.Root
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>
            <Flex align="center" gap="2">
              <TrashIcon size={18} />
              <Text weight="bold">Delete reports</Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Text className="text-[13px]">Delete this report?</Text>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button
                variant="solid"
                color="red"
                onClick={() => void handleConfirmDelete()}
                disabled={isDeleting}
              >
                {isDeleting ? <Spinner size="1" /> : <TrashIcon size={14} />}
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
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

function FilterSortMenu() {
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

  const itemClassName =
    "flex w-full items-center justify-between rounded-sm px-1 py-1 text-left text-[13px] text-gray-12 transition-colors hover:bg-gray-3 focus-visible:bg-gray-3 focus-visible:outline-none";

  const handleContentKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    e.stopPropagation();
    const container = e.currentTarget;
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    if (buttons.length === 0) return;
    const currentIndex = buttons.indexOf(
      document.activeElement as HTMLButtonElement,
    );
    const next =
      e.key === "ArrowDown"
        ? (currentIndex + 1) % buttons.length
        : (currentIndex - 1 + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return (
    <Popover.Root modal>
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
        onKeyDown={handleContentKeyDown}
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
                    onClick={() => setSort(option.field, option.direction)}
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
                    onClick={() => toggleStatus(status)}
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
                    onClick={() => toggleSourceProduct(option.value)}
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
