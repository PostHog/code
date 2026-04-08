import { useInboxBulkActions } from "@features/inbox/hooks/useInboxBulkActions";
import { useInboxReportSelectionStore } from "@features/inbox/stores/inboxReportSelectionStore";
import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import {
  ArrowClockwiseIcon,
  EyeSlashIcon,
  MagnifyingGlass,
  PauseIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Box,
  Button,
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
  readyCount?: number;
  processingCount?: number;
  pipelinePausedUntil?: string | null;
  searchDisabledReason?: string | null;
  hideFilters?: boolean;
  reports?: SignalReport[];
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

export function SignalsToolbar({
  totalCount,
  filteredCount,
  isSearchActive,
  livePolling = false,
  readyCount,
  processingCount = 0,
  pipelinePausedUntil,
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

  const pipelineHintParts = [
    readyCount != null && processingCount > 0
      ? `${readyCount} ready · ${processingCount} in pipeline`
      : null,
    pipelinePausedUntil
      ? `Pipeline paused · resumes in ${formatPauseRemaining(pipelinePausedUntil)}`
      : "Pipeline running",
  ].filter(Boolean);

  const pipelineHint =
    pipelineHintParts.length > 0 ? pipelineHintParts.join(" · ") : null;

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
        className="select-none"
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
        </Flex>

        <Flex align="center" gap="2">
          <Flex align="center" justify="center" className="shrink-0">
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
          {!hideFilters && (
            <Flex align="center" gap="1" className="shrink-0">
              <SuggestedReviewerFilterMenu />
              <FilterSortMenu />
            </Flex>
          )}
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
