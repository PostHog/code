import { useInboxDeepLinkListSync } from "@features/inbox/hooks/useInboxDeepLinkListSync";
import {
  useInboxAvailableSuggestedReviewers,
  useInboxReports,
  useInboxReportsInfinite,
  useInboxSignalProcessingState,
} from "@features/inbox/hooks/useInboxReports";
import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import { useInboxViewStore } from "@features/inbox/stores/inboxViewStore";
import {
  buildSignalReportListOrdering,
  buildStatusFilterParam,
  buildSuggestedReviewerFilterParam,
  filterReportsBySearch,
} from "@features/inbox/utils/filterReports";
import { INBOX_REFETCH_INTERVAL_MS } from "@features/inbox/utils/inboxConstants";
import { partitionInboxItems } from "@features/inbox/utils/inboxItemClassification";
import {
  useIntegrations,
  useRepositoryIntegration,
} from "@hooks/useIntegrations";
import { useMeQuery } from "@hooks/useMeQuery";
import type {
  SignalReportOrderingField,
  SignalReportsQueryParams,
} from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useRendererWindowFocusStore } from "@stores/rendererWindowFocusStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { InboxEmptyState } from "./InboxEmptyState";
import { InboxFilterBar } from "./InboxFilterBar";
import { InboxHeader } from "./InboxHeader";
import { InboxList } from "./InboxList";
import { InboxSourcesDialog } from "./InboxSourcesDialog";
import { InboxToolbar } from "./InboxToolbar";

export function InboxPage() {
  // ── Store state ─────────────────────────────────────────────────────────
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const statusFilter = useInboxSignalsFilterStore((s) => s.statusFilter);
  const sourceProductFilter = useInboxSignalsFilterStore(
    (s) => s.sourceProductFilter,
  );
  const suggestedReviewerFilter = useInboxSignalsFilterStore(
    (s) => s.suggestedReviewerFilter,
  );
  const resetFilters = useInboxSignalsFilterStore((s) => s.resetFilters);

  const scope = useInboxViewStore((s) => s.scope);
  const sort = useInboxViewStore((s) => s.sort);
  const activeTab = useInboxViewStore((s) => s.activeTab);
  const dismissedIds = useInboxViewStore((s) => s.dismissedIds);

  // ── Current user (for "For you" scope) ──────────────────────────────
  const { data: me } = useMeQuery();

  // ── GitHub integration ───────────────────────────────────────────────
  const { hasGithubIntegration } = useRepositoryIntegration();

  // ── Signal source configs ───────────────────────────────────────────────
  const { data: signalSourceConfigs, isPending: signalSourceConfigsPending } =
    useSignalSourceConfigs();
  const { isPending: integrationsPending, data: integrationsData } =
    useIntegrations();
  const hasGithubIntegrationFromQuery = useMemo(
    () => integrationsData?.some((i) => i.kind === "github") ?? false,
    [integrationsData],
  );
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
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);

  // ── Polling control ─────────────────────────────────────────────────────
  const windowFocused = useRendererWindowFocusStore((s) => s.focused);
  const isInboxView = useNavigationStore((s) => s.view.type === "inbox");
  const inboxPollingActive = windowFocused && isInboxView;

  // ── Data fetching ───────────────────────────────────────────────────────
  useInboxAvailableSuggestedReviewers({ enabled: isInboxView });

  // Use the view-level sort to determine API ordering
  const effectiveSortField: SignalReportOrderingField =
    sort === "priority" ? "priority" : "created_at";
  const effectiveSortDirection: "asc" | "desc" =
    sort === "priority" ? "asc" : "desc";

  // PRs tab: never filter by status (we want all reports so we can partition client-side).
  // Reports tab: apply the user's status filter.
  const inboxQueryParams = useMemo(
    (): SignalReportsQueryParams => ({
      status:
        activeTab === "pull-requests"
          ? undefined
          : buildStatusFilterParam(statusFilter),
      ordering: buildSignalReportListOrdering(
        effectiveSortField,
        effectiveSortDirection,
      ),
      source_product:
        sourceProductFilter.length > 0
          ? sourceProductFilter.join(",")
          : undefined,
      suggested_reviewers: (() => {
        // "For you" scope: filter to current user as suggested reviewer
        if (scope === "for-you" && me?.uuid) {
          // Merge with any explicit reviewer filter
          const ids =
            suggestedReviewerFilter.length > 0
              ? suggestedReviewerFilter
              : [me.uuid];
          return buildSuggestedReviewerFilterParam(ids);
        }
        // "Entire project" scope: only apply explicit reviewer filter
        return suggestedReviewerFilter.length > 0
          ? buildSuggestedReviewerFilterParam(suggestedReviewerFilter)
          : undefined;
      })(),
    }),
    [
      activeTab,
      scope,
      me?.uuid,
      statusFilter,
      effectiveSortField,
      effectiveSortDirection,
      sourceProductFilter,
      suggestedReviewerFilter,
    ],
  );

  const { allReports, isFetching } = useInboxReportsInfinite(inboxQueryParams, {
    refetchInterval: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : 12_000,
  });

  useInboxSignalProcessingState({
    enabled: isInboxView,
    refetchInterval: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : 12_000,
  });

  // ── Deep link sync ──────────────────────────────────────────────────────
  const reports = useMemo(
    () => filterReportsBySearch(allReports, searchQuery),
    [allReports, searchQuery],
  );

  useInboxDeepLinkListSync({
    reports,
    inboxPollingActive,
  });

  // ── Remove dismissed items ──────────────────────────────────────────────
  const filteredReports = useMemo(() => {
    if (dismissedIds.length === 0) return reports;
    const dismissedSet = new Set(dismissedIds);
    return reports.filter((r) => !dismissedSet.has(r.id));
  }, [reports, dismissedIds]);

  // ── Partition into PRs and Reports ──────────────────────────────────────
  const partitioned = useMemo(
    () => partitionInboxItems(filteredReports),
    [filteredReports],
  );

  // ── Source product counts (for filter bar, scoped to active tab) ────────
  const sourceCountsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    const tabReports =
      activeTab === "pull-requests"
        ? [...partitioned.prReports.ready, ...partitioned.prReports.review]
        : Object.values(partitioned.reportsBySection).flat();
    for (const report of tabReports) {
      for (const sp of report.source_products ?? []) {
        counts[sp] = (counts[sp] ?? 0) + 1;
      }
    }
    return counts;
  }, [activeTab, partitioned]);

  // ── Scope count probes (two independent API queries) ────────────────────
  // "All" probe: no suggested_reviewers filter → total count for the project.
  const { data: allProbe, isLoading: isAllProbeLoading } = useInboxReports(
    { limit: 1 },
    {
      enabled: isInboxView,
      refetchInterval: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : false,
      refetchIntervalInBackground: false,
      staleTime: 30_000,
    },
  );
  const allCount = allProbe?.count ?? 0;

  // "For you" probe: filtered to current user as suggested reviewer.
  const forYouProbeParams = useMemo(
    (): SignalReportsQueryParams => ({
      limit: 1,
      suggested_reviewers: me?.uuid ?? undefined,
    }),
    [me?.uuid],
  );
  const { data: forYouProbe } = useInboxReports(forYouProbeParams, {
    enabled: isInboxView && !!me?.uuid,
    refetchInterval: inboxPollingActive ? INBOX_REFETCH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
  const forYouCount = forYouProbe?.count ?? 0;

  // ── Empty state check ───────────────────────────────────────────────────
  const inboxSourcesPrerequisitesLoaded =
    !integrationsPending && !signalSourceConfigsPending;
  const projectHasAnyReports = allCount > 0;

  const showEmptyState =
    inboxSourcesPrerequisitesLoaded &&
    !isAllProbeLoading &&
    !projectHasAnyReports;

  // ── Auto-open sources dialog ─────────────────────────────────────────────
  const didAutoOpenRef = useRef(false);
  useEffect(() => {
    if (!isInboxView) {
      didAutoOpenRef.current = false;
      return;
    }
    if (!inboxSourcesPrerequisitesLoaded || isAllProbeLoading) return;
    if (projectHasAnyReports) return;
    if (hasSignalSources && hasGithubIntegrationFromQuery) return;
    if (didAutoOpenRef.current) return;
    didAutoOpenRef.current = true;
    setSourcesDialogOpen(true);
  }, [
    isInboxView,
    inboxSourcesPrerequisitesLoaded,
    isAllProbeLoading,
    projectHasAnyReports,
    hasSignalSources,
    hasGithubIntegrationFromQuery,
  ]);

  // ── Render ──────────────────────────────────────────────────────────────

  if (showEmptyState) {
    return (
      <div className="flex h-full flex-col px-4 pt-4 sm:px-6 sm:pt-6">
        <InboxHeader />
        <InboxEmptyState
          hasSignalSources={hasSignalSources}
          hasGithubIntegration={hasGithubIntegration}
          onEnableInbox={() => setSourcesDialogOpen(true)}
          enabledProducts={enabledProducts}
        />
        <InboxSourcesDialog
          open={sourcesDialogOpen}
          onOpenChange={setSourcesDialogOpen}
          hasSignalSources={hasSignalSources}
          hasGithubIntegration={hasGithubIntegration}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1200px] flex-col overflow-hidden px-4 pt-4 sm:px-6 sm:pt-6">
      <InboxHeader />
      <InboxToolbar
        prCount={partitioned.prCount}
        reportCount={partitioned.reportCount}
        forYouCount={forYouCount}
        allCount={allCount}
        livePolling={inboxPollingActive}
        isFetching={isFetching}
        onConfigureSources={() => setSourcesDialogOpen(true)}
      />
      <InboxFilterBar activeTab={activeTab} sourceCountsMap={sourceCountsMap} />
      <InboxList
        items={partitioned}
        allReports={filteredReports}
        hasActiveFilters={
          sourceProductFilter.length > 0 ||
          suggestedReviewerFilter.length > 0 ||
          !!searchQuery.trim()
        }
        onClearFilters={resetFilters}
      />
      <InboxSourcesDialog
        open={sourcesDialogOpen}
        onOpenChange={setSourcesDialogOpen}
        hasSignalSources={hasSignalSources}
        hasGithubIntegration={hasGithubIntegration}
      />
    </div>
  );
}
