import {
  SelectReportPane,
  SkeletonBackdrop,
  WarmingUpPane,
  WelcomePane,
} from "@features/inbox/components/InboxEmptyStates";
import { InboxSourcesDialog } from "@features/inbox/components/InboxSourcesDialog";
import {
  useInboxAvailableSuggestedReviewers,
  useInboxReportsInfinite,
  useInboxSignalProcessingState,
} from "@features/inbox/hooks/useInboxReports";
import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useInboxReportSelectionStore } from "@features/inbox/stores/inboxReportSelectionStore";
import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import { useInboxSignalsSidebarStore } from "@features/inbox/stores/inboxSignalsSidebarStore";
import { useInboxSourcesDialogStore } from "@features/inbox/stores/inboxSourcesDialogStore";
import {
  buildSignalReportListOrdering,
  buildStatusFilterParam,
  buildSuggestedReviewerFilterParam,
  filterReportsBySearch,
} from "@features/inbox/utils/filterReports";
import { INBOX_REFETCH_INTERVAL_MS } from "@features/inbox/utils/inboxConstants";
import { Box, Flex, ScrollArea } from "@radix-ui/themes";
import type { SignalReportsQueryParams } from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useRendererWindowFocusStore } from "@stores/rendererWindowFocusStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReportDetailPane } from "./detail/ReportDetailPane";
import { ReportListPane } from "./list/ReportListPane";
import { SignalsToolbar } from "./list/SignalsToolbar";

// ── Main component ──────────────────────────────────────────────────────────

export function InboxSignalsTab() {
  // ── Filter / sort store ─────────────────────────────────────────────────
  const sortField = useInboxSignalsFilterStore((s) => s.sortField);
  const sortDirection = useInboxSignalsFilterStore((s) => s.sortDirection);
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const statusFilter = useInboxSignalsFilterStore((s) => s.statusFilter);
  const sourceProductFilter = useInboxSignalsFilterStore(
    (s) => s.sourceProductFilter,
  );
  const suggestedReviewerFilter = useInboxSignalsFilterStore(
    (s) => s.suggestedReviewerFilter,
  );

  // ── Signal source configs ───────────────────────────────────────────────
  const { data: signalSourceConfigs } = useSignalSourceConfigs();
  const hasSignalSources = signalSourceConfigs?.some((c) => c.enabled) ?? false;
  const enabledProducts = useMemo(() => {
    const seen = new Set<string>();
    return (signalSourceConfigs ?? [])
      .filter(
        (c) =>
          c.enabled &&
          !seen.has(c.source_product) &&
          seen.add(c.source_product),
      )
      .map((c) => c.source_product);
  }, [signalSourceConfigs]);

  // ── Sources dialog ──────────────────────────────────────────────────────
  const sourcesDialogOpen = useInboxSourcesDialogStore((s) => s.open);
  const setSourcesDialogOpen = useInboxSourcesDialogStore((s) => s.setOpen);

  // ── Polling control ─────────────────────────────────────────────────────
  const windowFocused = useRendererWindowFocusStore((s) => s.focused);
  const isInboxView = useNavigationStore((s) => s.view.type === "inbox");
  const inboxPollingActive = windowFocused && isInboxView;

  // ── Data fetching ───────────────────────────────────────────────────────
  useInboxAvailableSuggestedReviewers({
    enabled: isInboxView,
  });

  const inboxQueryParams = useMemo(
    (): SignalReportsQueryParams => ({
      status: buildStatusFilterParam(statusFilter),
      ordering: buildSignalReportListOrdering(sortField, sortDirection),
      source_product:
        sourceProductFilter.length > 0
          ? sourceProductFilter.join(",")
          : undefined,
      suggested_reviewers:
        suggestedReviewerFilter.length > 0
          ? buildSuggestedReviewerFilterParam(suggestedReviewerFilter)
          : undefined,
    }),
    [
      statusFilter,
      sortField,
      sortDirection,
      sourceProductFilter,
      suggestedReviewerFilter,
    ],
  );

  const {
    allReports,
    totalCount,
    isLoading,
    isFetching,
    error,
    refetch,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInboxReportsInfinite(inboxQueryParams, {
    refetchInterval: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : 12_000,
  });

  const reports = useMemo(
    () => filterReportsBySearch(allReports, searchQuery),
    [allReports, searchQuery],
  );

  const { data: signalProcessingState } = useInboxSignalProcessingState({
    enabled: isInboxView,
    refetchInterval: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : 12_000,
  });

  const readyCount = useMemo(
    () => allReports.filter((r) => r.status === "ready").length,
    [allReports],
  );
  const processingCount = useMemo(
    () => allReports.filter((r) => r.status !== "ready").length,
    [allReports],
  );

  // ── Selection state ─────────────────────────────────────────────────────
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const selectedReportIds = useInboxReportSelectionStore(
    (s) => s.selectedReportIds ?? [],
  );
  const toggleReportSelection = useInboxReportSelectionStore(
    (s) => s.toggleReportSelection,
  );
  const pruneSelection = useInboxReportSelectionStore((s) => s.pruneSelection);

  useEffect(() => {
    if (reports.length === 0) {
      setSelectedReportId(null);
      return;
    }
    if (!selectedReportId) {
      return;
    }
    const selectedExists = reports.some(
      (report) => report.id === selectedReportId,
    );
    if (!selectedExists) {
      setSelectedReportId(null);
    }
  }, [reports, selectedReportId]);

  useEffect(() => {
    pruneSelection(reports.map((report) => report.id));
  }, [reports, pruneSelection]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  // ── Sidebar resize ─────────────────────────────────────────────────────
  const sidebarWidth = useInboxSignalsSidebarStore((state) => state.width);
  const sidebarIsResizing = useInboxSignalsSidebarStore(
    (state) => state.isResizing,
  );
  const setSidebarWidth = useInboxSignalsSidebarStore(
    (state) => state.setWidth,
  );
  const setSidebarIsResizing = useInboxSignalsSidebarStore(
    (state) => state.setIsResizing,
  );
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setSidebarIsResizing(true);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [setSidebarIsResizing],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarIsResizing || !containerRef.current) return;
      const containerLeft = containerRef.current.getBoundingClientRect().left;
      const containerWidth = containerRef.current.offsetWidth;
      const maxWidth = containerWidth * 0.6;
      const newWidth = Math.max(
        220,
        Math.min(maxWidth, e.clientX - containerLeft),
      );
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (sidebarIsResizing) {
        setSidebarIsResizing(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [sidebarIsResizing, setSidebarWidth, setSidebarIsResizing]);

  // ── Layout mode (computed early — needed by focus effect below) ────────
  const hasReports = allReports.length > 0;
  const hasActiveFilters =
    sourceProductFilter.length > 0 ||
    suggestedReviewerFilter.length > 0 ||
    statusFilter.length < 5;
  const shouldShowTwoPane =
    hasReports || !!searchQuery.trim() || hasActiveFilters;

  // Sticky: once we enter two-pane mode, stay there even if a refetch
  // momentarily empties the list (e.g. when sort order changes).
  const hasMountedTwoPaneRef = useRef(false);
  if (shouldShowTwoPane) {
    hasMountedTwoPaneRef.current = true;
  }
  const showTwoPaneLayout = hasMountedTwoPaneRef.current;

  // ── Arrow-key navigation between reports ──────────────────────────────
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const selectedReportIdRef = useRef(selectedReportId);
  selectedReportIdRef.current = selectedReportId;
  const leftPaneRef = useRef<HTMLDivElement>(null);

  const focusListPane = useCallback(() => {
    requestAnimationFrame(() => {
      leftPaneRef.current?.focus();
    });
  }, []);

  // Auto-focus the list pane when the two-pane layout appears
  useEffect(() => {
    if (showTwoPaneLayout) {
      // Small delay to ensure the ref is mounted after conditional render
      focusListPane();
    }
  }, [focusListPane, showTwoPaneLayout]);

  const navigateReport = useCallback((direction: 1 | -1) => {
    const list = reportsRef.current;
    if (list.length === 0) return;

    const currentId = selectedReportIdRef.current;
    const currentIndex = currentId
      ? list.findIndex((r) => r.id === currentId)
      : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.max(0, Math.min(list.length - 1, currentIndex + direction));
    const nextId = list[nextIndex].id;

    setSelectedReportId(nextId);

    const container = leftPaneRef.current;
    const row = container?.querySelector<HTMLElement>(
      `[data-report-id="${nextId}"]`,
    );
    const stickyHeader = container?.querySelector<HTMLElement>(
      "[data-inbox-sticky-header]",
    );

    if (!row) return;

    const stickyHeaderHeight = stickyHeader?.offsetHeight ?? 0;
    row.style.scrollMarginTop = `${stickyHeaderHeight}px`;
    row.scrollIntoView({ block: "nearest" });
  }, []);

  // Window-level keyboard handler so arrow keys work regardless of which
  // pane has focus — only suppressed inside interactive widgets.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when any Radix overlay or interactive widget is open
      if (
        document.querySelector(
          "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']",
        )
      )
        return;

      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea")) return;
      if (e.key === " " && target.closest("button, [role='checkbox']")) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        navigateReport(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateReport(-1);
      } else if (e.key === " " && selectedReportIdRef.current) {
        e.preventDefault();
        toggleReportSelection(selectedReportIdRef.current);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigateReport, toggleReportSelection]);

  const searchDisabledReason =
    !hasReports && !searchQuery.trim()
      ? "No reports in the project\u2026 yet"
      : null;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <>
      {showTwoPaneLayout ? (
        <Flex ref={containerRef} height="100%" style={{ minHeight: 0 }}>
          {/* ── Left pane: report list ───────────────────────────────── */}
          <Box
            className="select-none"
            style={{
              width: `${sidebarWidth}px`,
              maxWidth: "60%",
              height: "100%",
              flex: "none",
              borderRight: "1px solid var(--gray-5)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <ScrollArea
              type="auto"
              className="scroll-area-constrain-width inbox-report-list-scroll"
              style={{ height: "100%" }}
            >
              <Flex
                ref={leftPaneRef}
                direction="column"
                tabIndex={0}
                className="outline-none"
                onMouseDownCapture={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("[data-report-id]")) {
                    focusListPane();
                  }
                }}
                onFocusCapture={(e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target !== leftPaneRef.current &&
                    target.closest("[data-report-id]")
                  ) {
                    focusListPane();
                  }
                }}
              >
                <Box
                  data-inbox-sticky-header
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 10,
                    backgroundColor: "var(--color-background)",
                  }}
                >
                  <SignalsToolbar
                    totalCount={totalCount}
                    filteredCount={reports.length}
                    isSearchActive={!!searchQuery.trim()}
                    livePolling={inboxPollingActive}
                    readyCount={readyCount}
                    processingCount={processingCount}
                    pipelinePausedUntil={signalProcessingState?.paused_until}
                    reports={reports}
                  />
                </Box>
                <ReportListPane
                  reports={reports}
                  allReports={allReports}
                  isLoading={isLoading}
                  isFetching={isFetching}
                  error={error}
                  refetch={refetch}
                  hasNextPage={hasNextPage}
                  isFetchingNextPage={isFetchingNextPage}
                  fetchNextPage={fetchNextPage}
                  hasSignalSources={hasSignalSources}
                  searchQuery={searchQuery}
                  hasActiveFilters={hasActiveFilters}
                  selectedReportId={selectedReportId}
                  selectedReportIds={selectedReportIds}
                  onSelectReport={setSelectedReportId}
                  onToggleReportSelection={toggleReportSelection}
                />
              </Flex>
            </ScrollArea>

            {/* Resize handle */}
            <Box
              onMouseDown={handleResizeMouseDown}
              className="no-drag"
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 0,
                width: "4px",
                cursor: "col-resize",
                backgroundColor: "transparent",
                zIndex: 100,
              }}
            />
          </Box>

          {/* ── Right pane: detail ───────────────────────────────── */}
          <Flex
            direction="column"
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              position: "relative",
            }}
          >
            {selectedReport ? (
              <ReportDetailPane
                report={selectedReport}
                onClose={() => setSelectedReportId(null)}
              />
            ) : (
              <SelectReportPane />
            )}
          </Flex>
        </Flex>
      ) : (
        /* ── Full-width empty state with skeleton backdrop ──────── */
        <Box style={{ height: "100%", position: "relative" }}>
          <Flex direction="column">
            <SignalsToolbar
              totalCount={0}
              filteredCount={0}
              isSearchActive={false}
              pipelinePausedUntil={signalProcessingState?.paused_until}
              searchDisabledReason={searchDisabledReason}
              hideFilters
            />
            <SkeletonBackdrop />
          </Flex>
          <Box
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(to bottom, transparent 0%, var(--color-background) 30%)",
            }}
          >
            {!hasSignalSources ? (
              <WelcomePane onEnableInbox={() => setSourcesDialogOpen(true)} />
            ) : (
              <WarmingUpPane
                onConfigureSources={() => setSourcesDialogOpen(true)}
                enabledProducts={enabledProducts}
              />
            )}
          </Box>
        </Box>
      )}

      {/* ── Sources config dialog ──────────────────────────────── */}
      <InboxSourcesDialog
        open={sourcesDialogOpen}
        onOpenChange={setSourcesDialogOpen}
        hasSignalSources={hasSignalSources}
      />
    </>
  );
}
