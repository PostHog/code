import { Button } from "@components/ui/Button";
import { useInboxBulkActions } from "@features/inbox/hooks/useInboxBulkActions";
import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import { INBOX_REFETCH_INTERVAL_MS } from "@features/inbox/utils/inboxConstants";
import {
  ArrowClockwiseIcon,
  EyeSlashIcon,
  GearSixIcon,
  MagnifyingGlass,
  Pause,
  ThumbsDownIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Box,
  Checkbox,
  Flex,
  Spinner,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import { IS_DEV } from "@shared/constants/environment";
import type { SignalReport } from "@shared/types";
import { useState } from "react";
import { FilterSortMenu } from "./FilterSortMenu";
import { SuggestedReviewerFilterMenu } from "./SuggestedReviewerFilterMenu";

interface SignalsToolbarProps {
  totalCount: number;
  filteredCount: number;
  isSearchActive: boolean;
  livePolling?: boolean;
  isFetching?: boolean;
  readyCount?: number;
  processingCount?: number;
  pipelinePausedUntil?: string | null;
  searchDisabledReason?: string | null;
  hideFilters?: boolean;
  reports?: SignalReport[];
  /** Pre-computed effective bulk selection (store ids or virtual open-report fallback). */
  effectiveBulkIds?: string[];
  /** Called when the select-all checkbox is toggled. Parent owns all state transitions. */
  onToggleSelectAll?: (checked: boolean) => void;
  /** Called when the "Configure sources" button is clicked. */
  onConfigureSources?: () => void;
  /** Opens the shared dismiss report dialog (0–1 selected toolbar flow). */
  onOpenDismissDialog?: () => void;
  /** True while the shared dismiss dialog mutation is in-flight for this toolbar context. */
  isDismissMutationPending?: boolean;
}

function formatPauseRemaining(pausedUntil: string): string {
  const diffMs = new Date(pausedUntil).getTime() - Date.now();

  if (diffMs <= 0) {
    return "resuming soon";
  }

  const totalMinutes = Math.ceil(diffMs / 60_000);

  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours < 24) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;

  return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

const inboxLivePollingTooltip = `Inbox is focused – syncing reports every ${Math.round(INBOX_REFETCH_INTERVAL_MS / 1000)}s…`;

export function SignalsToolbar({
  totalCount,
  filteredCount,
  isSearchActive,
  livePolling = false,
  isFetching = false,
  readyCount,
  processingCount = 0,
  pipelinePausedUntil,
  searchDisabledReason,
  hideFilters,
  reports = [],
  effectiveBulkIds = [],
  onToggleSelectAll,
  onConfigureSources,
  onOpenDismissDialog,
  isDismissMutationPending = false,
}: SignalsToolbarProps) {
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const setSearchQuery = useInboxSignalsFilterStore((s) => s.setSearchQuery);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    selectedCount,
    snoozeDisabledReason,
    suppressDisabledReason,
    deleteDisabledReason,
    reingestDisabledReason,
    isSuppressing,
    isSnoozing,
    isDeleting,
    isReingesting,
    snoozeSelected,
    suppressSelected,
    deleteSelected,
    reingestSelected,
  } = useInboxBulkActions(reports, effectiveBulkIds);

  const countLabel = isSearchActive
    ? `${filteredCount} of ${totalCount}`
    : `${totalCount}`;

  const pipelineHintParts = [
    readyCount != null && processingCount > 0
      ? `${readyCount} up for review • ${processingCount} in research pipeline`
      : null,
    pipelinePausedUntil
      ? `Pipeline paused · resumes in ${formatPauseRemaining(pipelinePausedUntil)}`
      : null,
  ].filter(Boolean);

  const pipelineHint =
    pipelineHintParts.length > 0 ? pipelineHintParts.join(" · ") : null;

  const multiSelectBulkActions = selectedCount > 1;

  const singleDismissDisabledReason =
    selectedCount === 0
      ? snoozeDisabledReason
      : snoozeDisabledReason !== null && suppressDisabledReason !== null
        ? `${suppressDisabledReason} · ${snoozeDisabledReason}`
        : null;

  const handleBulkSuppress = async () => {
    await suppressSelected();
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
    effectiveBulkIds.includes(reportId),
  ).length;
  const allVisibleSelected =
    hasVisibleReports && selectedVisibleCount === visibleReportIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && selectedVisibleCount < visibleReportIds.length;

  return (
    <>
      <Flex
        direction="column"
        gap="2"
        className="select-none border-b border-b-(--gray-5) p-[8px]"
      >
        <Flex align="center" justify="between" gap="2">
          <Flex direction="column" gap="0" className="min-w-0">
            <Flex align="center" gap="2">
              <Text color="gray" className="shrink-0 text-[12px]">
                Reports ({countLabel})
              </Text>
              {livePolling ? (
                <Tooltip content={inboxLivePollingTooltip}>
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
              ) : null}
            </Flex>
            {pipelineHint && !isSearchActive ? (
              <Text color="gray" className="text-[11px] opacity-80">
                {pipelineHint}
              </Text>
            ) : null}
          </Flex>
          {onConfigureSources ? (
            <button
              type="button"
              onClick={onConfigureSources}
              className="flex shrink-0 cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-gray-10 transition-colors hover:text-gray-12"
            >
              <GearSixIcon size={12} />
              <span>Configure sources</span>
            </button>
          ) : null}
        </Flex>

        <Flex align="center" gap="2">
          <Tooltip
            content={searchDisabledReason}
            hidden={!searchDisabledReason}
          >
            <Box className="min-w-0 flex-1 select-text">
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
          {!hideFilters && (
            <Flex align="center" gap="1" className="shrink-0">
              <SuggestedReviewerFilterMenu />
              <FilterSortMenu />
            </Flex>
          )}
        </Flex>

        <Flex gap="2" align="center" justify="between" wrap="wrap-reverse">
          <Tooltip
            content={
              <>
                {allVisibleSelected || someVisibleSelected
                  ? "Click to unselect all"
                  : "Click to select all"}
                <br />
                Select items in bulk with Shift and {"\u2318"}
              </>
            }
          >
            {/* biome-ignore lint/a11y/noLabelWithoutControl: Radix Checkbox renders as button[role=checkbox] inside the label, which is valid */}
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                size="1"
                checked={
                  someVisibleSelected ? "indeterminate" : allVisibleSelected
                }
                disabled={!hasVisibleReports}
                onCheckedChange={(checked) =>
                  onToggleSelectAll?.(checked === true)
                }
                aria-label="Select all visible reports"
              />
              <Text color="gray" className="text-[11px]">
                {selectedCount} selected
              </Text>
            </label>
          </Tooltip>
          <Flex gap="2" align="center" wrap="wrap">
            {multiSelectBulkActions ? (
              <>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="text-[12px]"
                  tooltipContent="Wait for selected reports to gather more context"
                  disabledReason={snoozeDisabledReason}
                  disabled={snoozeDisabledReason !== null || isSnoozing}
                  onClick={() => void handleSnooze()}
                >
                  {isSnoozing ? <Spinner size="1" /> : <Pause size={12} />}
                  Snooze
                </Button>
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="text-[12px]"
                  tooltipContent="Suppress selected reports — no confirmation dialog"
                  disabledReason={suppressDisabledReason}
                  disabled={suppressDisabledReason !== null || isSuppressing}
                  onClick={() => void handleBulkSuppress()}
                >
                  {isSuppressing ? (
                    <Spinner size="1" />
                  ) : (
                    <EyeSlashIcon size={12} />
                  )}
                  Suppress
                </Button>
              </>
            ) : (
              <Button
                size="1"
                variant="soft"
                color="gray"
                className="text-[12px]"
                tooltipContent="Snooze or permanently dismiss — pick a reason"
                disabledReason={singleDismissDisabledReason}
                disabled={
                  singleDismissDisabledReason !== null ||
                  isDismissMutationPending
                }
                onClick={() => onOpenDismissDialog?.()}
              >
                {isDismissMutationPending ? (
                  <Spinner size="1" />
                ) : (
                  <ThumbsDownIcon size={12} />
                )}
                Dismiss
              </Button>
            )}
            <Button
              size="1"
              variant="soft"
              color="red"
              className="text-[12px]"
              tooltipContent="Delete this report and its signals"
              disabledReason={deleteDisabledReason}
              disabled={deleteDisabledReason !== null || isDeleting}
              onClick={() => setShowDeleteConfirm(true)}
            >
              {isDeleting ? <Spinner size="1" /> : <TrashIcon size={12} />}
              Delete
            </Button>
            {IS_DEV && (
              <Button
                size="1"
                variant="soft"
                color="blue"
                className="text-[12px]"
                tooltipContent="DEV-ONLY: Reingest this report to gather more context"
                disabledReason={reingestDisabledReason}
                disabled={reingestDisabledReason !== null || isReingesting}
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
      </Flex>

      <AlertDialog.Root
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
      >
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>
            <Flex align="center" gap="2">
              <TrashIcon size={18} />
              <Text className="font-bold">Delete reports</Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description className="text-sm">
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
