import {
  ArrowsClockwiseIcon,
  CircleNotchIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import type { SignalReport } from "@shared/types";
import { useEffect, useRef } from "react";
import { ReportListRow } from "./ReportListRow";

// ── LoadMoreTrigger (intersection observer for infinite scroll) ──────────────

function LoadMoreTrigger({
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !hasNextPage) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!hasNextPage && !isFetchingNextPage) return null;

  return (
    <Flex ref={ref} align="center" justify="center" py="3">
      {isFetchingNextPage ? (
        <Text size="1" color="gray" className="text-[12px]">
          Loading more...
        </Text>
      ) : null}
    </Flex>
  );
}

// ── ReportListPane ──────────────────────────────────────────────────────────

interface ReportListPaneProps {
  reports: SignalReport[];
  allReports: SignalReport[];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  hasSignalSources: boolean;
  searchQuery: string;
  hasActiveFilters: boolean;
  selectedReportId: string | null;
  selectedReportIds: string[];
  onSelectReport: (id: string) => void;
  onToggleReportSelection: (id: string) => void;
}

export function ReportListPane({
  reports,
  allReports,
  isLoading,
  isFetching,
  error,
  refetch,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  hasSignalSources,
  searchQuery,
  hasActiveFilters,
  selectedReportId,
  selectedReportIds = [],
  onSelectReport,
  onToggleReportSelection,
}: ReportListPaneProps) {
  // ── Loading skeleton ────────────────────────────────────────────────────
  if (isLoading && allReports.length === 0 && hasSignalSources) {
    return (
      <Flex direction="column">
        {Array.from({ length: 5 }).map((_, index) => (
          <Flex
            // biome-ignore lint/suspicious/noArrayIndexKey: static loading placeholders
            key={index}
            direction="column"
            gap="2"
            px="3"
            py="3"
            className="border-gray-5 border-b"
          >
            <Box className="h-[12px] w-[44%] animate-pulse rounded bg-gray-4" />
            <Box className="h-[11px] w-[82%] animate-pulse rounded bg-gray-3" />
          </Flex>
        ))}
      </Flex>
    );
  }

  // ── Error state ─────────────────────────────────────────────────────────
  if (error) {
    return (
      <Flex align="center" justify="center" py="8" px="4">
        <Flex direction="column" align="center" gap="3" className="text-center">
          <WarningIcon size={20} className="text-amber-10" weight="bold" />
          <Text size="1" color="gray" className="text-[12px]">
            Could not load signals
          </Text>
          <Button
            size="1"
            variant="soft"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <CircleNotchIcon size={12} className="animate-spin" />
            ) : (
              <ArrowsClockwiseIcon size={12} />
            )}
            Retry
          </Button>
        </Flex>
      </Flex>
    );
  }

  // ── No search results ───────────────────────────────────────────────────
  if (reports.length === 0 && searchQuery.trim()) {
    return (
      <Flex direction="column" align="center" justify="center" gap="2" py="6">
        <Text size="1" color="gray" className="text-[12px]">
          No matching reports
        </Text>
      </Flex>
    );
  }

  // ── No filter results ───────────────────────────────────────────────────
  if (reports.length === 0 && hasActiveFilters) {
    return (
      <Flex direction="column" align="center" justify="center" gap="2" py="6">
        <Text size="1" color="gray" className="text-[12px]">
          No reports match current filters
        </Text>
      </Flex>
    );
  }

  // ── Report list ─────────────────────────────────────────────────────────
  return (
    <>
      {reports.map((report, index) => (
        <ReportListRow
          key={report.id}
          index={index}
          report={report}
          isSelected={selectedReportId === report.id}
          isChecked={selectedReportIds.includes(report.id)}
          onClick={() => onSelectReport(report.id)}
          onToggleChecked={() => onToggleReportSelection(report.id)}
        />
      ))}
      <LoadMoreTrigger
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </>
  );
}
