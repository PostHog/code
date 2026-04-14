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
import { useCallback, useEffect, useMemo, useRef } from "react";
import { MultiSelectStack } from "./detail/MultiSelectStack";
import { ReportDetailPane } from "./detail/ReportDetailPane";
import { GitHubConnectionBanner } from "./list/GitHubConnectionBanner";
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

  // ── Selection state (unified — store is single source of truth) ─────────
  const selectedReportIds = useInboxReportSelectionStore(
    (s) => s.selectedReportIds,
  );
  const setSelectedReportIds = useInboxReportSelectionStore(
    (s) => s.setSelectedReportIds,
  );
  const toggleReportSelection = useInboxReportSelectionStore(
    (s) => s.toggleReportSelection,
  );
  const selectRange = useInboxReportSelectionStore((s) => s.selectRange);
  const selectExactRange = useInboxReportSelectionStore(
    (s) => s.selectExactRange,
  );
  const pruneSelection = useInboxReportSelectionStore((s) => s.pruneSelection);
  const clearSelection = useInboxReportSelectionStore((s) => s.clearSelection);

  // Stable refs so callbacks don't need re-registration on every render
  const selectedReportIdsRef = useRef(selectedReportIds);
  selectedReportIdsRef.current = selectedReportIds;
  const reportsRef = useRef(reports);
  reportsRef.current = reports;

  // Prune selection when visible reports change (e.g. filter/search)
  useEffect(() => {
    pruneSelection(reports.map((report) => report.id));
  }, [reports, pruneSelection]);

  // The report to show in the detail pane (only when exactly 1 is selected)
  const selectedReport = useMemo(() => {
    if (selectedReportIds.length !== 1) return null;
    return reports.find((r) => r.id === selectedReportIds[0]) ?? null;
  }, [reports, selectedReportIds]);

  // Reports for the multi-select stack (when 2+ selected)
  const selectedReports = useMemo(() => {
    if (selectedReportIds.length < 2) return [];
    const idSet = new Set(selectedReportIds);
    return reports.filter((r) => idSet.has(r.id));
  }, [reports, selectedReportIds]);

  // ── Click handler: plain / cmd / shift ──────────────────────────────────
  const handleReportClick = useCallback(
    (reportId: string, event: { metaKey: boolean; shiftKey: boolean }) => {
      if (event.shiftKey) {
        selectRange(
          reportId,
          reportsRef.current.map((r) => r.id),
        );
      } else if (event.metaKey) {
        toggleReportSelection(reportId);
      } else if (
        selectedReportIdsRef.current.length === 1 &&
        selectedReportIdsRef.current[0] === reportId
      ) {
        // Plain click on the only selected report — deselect it
        clearSelection();
      } else {
        // Plain click — select only this report
        setSelectedReportIds([reportId]);
      }
    },
    [selectRange, toggleReportSelection, setSelectedReportIds, clearSelection],
  );

  // Select-all checkbox
  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      if (checked) {
        setSelectedReportIds(reportsRef.current.map((r) => r.id));
      } else {
        clearSelection();
      }
    },
    [setSelectedReportIds, clearSelection],
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
  const leftPaneRef = useRef<HTMLDivElement>(null);

  const focusListPane = useCallback(() => {
    requestAnimationFrame(() => {
      leftPaneRef.current?.focus();
    });
  }, []);

  // Auto-focus the list pane when the two-pane layout appears
  useEffect(() => {
    if (showTwoPaneLayout) {
      focusListPane();
    }
  }, [focusListPane, showTwoPaneLayout]);

  // Tracks the cursor position for keyboard navigation (the "moving end" of
  // Shift+Arrow selection). Separated from `lastClickedId` which acts as the
  // anchor so that the anchor stays fixed while the cursor extends the range.
  const keyboardCursorIdRef = useRef<string | null>(null);

  const navigateReport = useCallback(
    (direction: 1 | -1, shift: boolean) => {
      const list = reportsRef.current;
      if (list.length === 0) return;

      // Determine cursor position — the item to navigate away from
      const cursorId =
        keyboardCursorIdRef.current ??
        (selectedReportIdsRef.current.length > 0
          ? selectedReportIdsRef.current[
              selectedReportIdsRef.current.length - 1
            ]
          : null);
      const cursorIndex = cursorId
        ? list.findIndex((r) => r.id === cursorId)
        : -1;
      const nextIndex =
        cursorIndex === -1
          ? 0
          : Math.max(0, Math.min(list.length - 1, cursorIndex + direction));
      const nextId = list[nextIndex].id;

      if (shift) {
        // Anchor is the store's lastClickedId — the point where shift-selection started.
        // selectExactRange replaces the selection with the exact range from anchor to cursor,
        // so reversing direction correctly contracts the selection.
        const anchor =
          useInboxReportSelectionStore.getState().lastClickedId ?? nextId;
        selectExactRange(
          anchor,
          nextId,
          list.map((r) => r.id),
        );
        keyboardCursorIdRef.current = nextId;
      } else {
        setSelectedReportIds([nextId]);
        keyboardCursorIdRef.current = nextId;
      }

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
    },
    [setSelectedReportIds, selectExactRange],
  );

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
        navigateReport(1, e.shiftKey);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        navigateReport(-1, e.shiftKey);
      } else if (
        e.key === "Escape" &&
        selectedReportIdsRef.current.length > 0
      ) {
        e.preventDefault();
        clearSelection();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigateReport, clearSelection]);

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
                // Clicking a row/button/checkbox would normally move browser focus to that
                // element, losing the container's focus and breaking arrow-key navigation.
                // Intercept mousedown to redirect focus back to the container instead.
                // Text fields are exempt so the search box can still receive focus normally.
                onMouseDownCapture={(e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target.closest(
                      "input, textarea, select, [contenteditable='true']",
                    )
                  ) {
                    return;
                  }
                  if (target.closest("[data-report-id], button")) {
                    focusListPane();
                  }
                }}
                // Same redirect for focus arriving via keyboard (Tab) — if focus lands
                // inside a row element rather than on the container itself, pull it back up.
                onFocusCapture={(e) => {
                  const target = e.target as HTMLElement;
                  if (
                    target.closest(
                      "input, textarea, select, [contenteditable='true']",
                    )
                  ) {
                    return;
                  }
                  if (
                    target !== leftPaneRef.current &&
                    target.closest("[data-report-id], button")
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
                    effectiveBulkIds={selectedReportIds}
                    onToggleSelectAll={handleToggleSelectAll}
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
                  selectedReportIds={selectedReportIds}
                  onReportClick={handleReportClick}
                  onToggleReportSelection={toggleReportSelection}
                />
              </Flex>
            </ScrollArea>

            <GitHubConnectionBanner />

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
            {selectedReports.length > 1 ? (
              <MultiSelectStack
                reports={selectedReports}
                onClearSelection={clearSelection}
              />
            ) : selectedReport ? (
              <ReportDetailPane
                report={selectedReport}
                onClose={clearSelection}
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
              pointerEvents: "none",
              background:
                "linear-gradient(to bottom, transparent 0%, var(--color-background) 30%)",
            }}
          >
            <Box style={{ pointerEvents: "auto" }}>
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
