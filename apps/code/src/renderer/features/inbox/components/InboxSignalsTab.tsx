import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { InboxLiveRail } from "@features/inbox/components/InboxLiveRail";
import {
  useInboxReportArtefacts,
  useInboxReportSignals,
  useInboxReportsInfinite,
} from "@features/inbox/hooks/useInboxReports";
import { useSignalSourceConfigs } from "@features/inbox/hooks/useSignalSourceConfigs";
import { useInboxCloudTaskStore } from "@features/inbox/stores/inboxCloudTaskStore";
import { useInboxSignalsFilterStore } from "@features/inbox/stores/inboxSignalsFilterStore";
import { useInboxSignalsSidebarStore } from "@features/inbox/stores/inboxSignalsSidebarStore";
import { buildSignalTaskPrompt } from "@features/inbox/utils/buildSignalTaskPrompt";
import {
  buildSignalReportListOrdering,
  buildStatusFilterParam,
  filterReportsBySearch,
} from "@features/inbox/utils/filterReports";
import { INBOX_REFETCH_INTERVAL_MS } from "@features/inbox/utils/inboxConstants";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { SignalSourcesSettings } from "@features/settings/components/sections/SignalSourcesSettings";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowDownIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CircleNotchIcon,
  ClockIcon,
  Cloud as CloudIcon,
  GithubLogoIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Dialog,
  Flex,
  ScrollArea,
  Select,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/explorer-hog.png";
import graphsHog from "@renderer/assets/images/graphs-hog.png";
import mailHog from "@renderer/assets/images/mail-hog.png";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import type {
  SignalReportArtefact,
  SignalReportArtefactsResponse,
  SignalReportsQueryParams,
  SuggestedReviewersArtefact,
} from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useRendererWindowFocusStore } from "@stores/rendererWindowFocusStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ReportCard } from "./ReportCard";
import { ReportTaskLogs } from "./ReportTaskLogs";
import { SignalCard } from "./SignalCard";
import { SignalReportPriorityBadge } from "./SignalReportPriorityBadge";
import { SignalReportSummaryMarkdown } from "./SignalReportSummaryMarkdown";
import { SignalsToolbar } from "./SignalsToolbar";

function getArtefactsUnavailableMessage(
  reason: SignalReportArtefactsResponse["unavailableReason"],
): string {
  switch (reason) {
    case "forbidden":
      return "Evidence could not be loaded with the current API permissions.";
    case "not_found":
      return "Evidence endpoint is unavailable for this signal in this environment.";
    case "invalid_payload":
      return "Evidence format was unexpected, so no artefacts could be shown.";
    case "request_failed":
      return "Evidence is temporarily unavailable. You can still create a task from this report.";
    default:
      return "Evidence is currently unavailable for this signal.";
  }
}

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

// ── Animated ellipsis for warming-up inline text ─────────────────────────────

function AnimatedEllipsis() {
  return (
    <span aria-hidden>
      <span className="inline-flex items-end gap-px leading-none">
        <span className="inbox-ellipsis-dot">.</span>
        <span className="inbox-ellipsis-dot">.</span>
        <span className="inbox-ellipsis-dot">.</span>
      </span>
    </span>
  );
}

// ── Right pane empty states ─────────────────────────────────────────────────

function WelcomePane({ onEnableInbox }: { onEnableInbox: () => void }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
    >
      <Flex direction="column" align="center" style={{ maxWidth: 420 }}>
        <img src={graphsHog} alt="" style={{ width: 120, marginBottom: 16 }} />

        <Text
          size="4"
          weight="bold"
          align="center"
          style={{ color: "var(--gray-12)" }}
        >
          Welcome to your Inbox
        </Text>

        <Flex
          direction="column"
          align="center"
          gap="3"
          mt="3"
          style={{ maxWidth: 340 }}
        >
          <Text
            size="1"
            align="center"
            style={{ color: "var(--gray-11)", lineHeight: 1.35 }}
          >
            <Text weight="medium" style={{ color: "var(--gray-12)" }}>
              Background analysis of your data — while you sleep.
            </Text>
            <br />
            Session recordings watched automatically. Issues, tickets, and evals
            analyzed around the clock.
          </Text>

          <ArrowDownIcon size={14} style={{ color: "var(--gray-8)" }} />

          <Text
            size="1"
            align="center"
            style={{ color: "var(--gray-11)", lineHeight: 1.35 }}
          >
            <Text weight="medium" style={{ color: "var(--gray-12)" }}>
              Ready-to-run fixes for real user problems.
            </Text>
            <br />
            Each report includes evidence and impact numbers — just execute the
            prompt in your agent.
          </Text>
        </Flex>

        <Button size="2" style={{ marginTop: 20 }} onClick={onEnableInbox}>
          Enable Inbox
        </Button>
      </Flex>
    </Flex>
  );
}

function WarmingUpPane({
  onConfigureSources,
}: {
  onConfigureSources: () => void;
}) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
    >
      <Flex direction="column" align="center" style={{ maxWidth: 420 }}>
        <img
          src={explorerHog}
          alt=""
          style={{ width: 120, marginBottom: 16 }}
        />

        <Text
          size="4"
          weight="bold"
          align="center"
          as="div"
          style={{ color: "var(--gray-12)" }}
        >
          Inbox is warming up
          <AnimatedEllipsis />
        </Text>

        <Text
          size="1"
          align="center"
          mt="3"
          style={{ color: "var(--gray-11)", lineHeight: 1.35 }}
        >
          Reports will appear here as soon as signals come in.
        </Text>

        <Button
          size="2"
          variant="soft"
          color="gray"
          style={{ marginTop: 16 }}
          onClick={onConfigureSources}
        >
          Configure sources
        </Button>
      </Flex>
    </Flex>
  );
}

function SelectReportPane() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      height="100%"
      px="5"
    >
      <Flex direction="column" align="center" style={{ maxWidth: 300 }}>
        <img
          src={mailHog}
          alt=""
          style={{ width: 100, marginBottom: 12, opacity: 0.8 }}
        />
        <Text
          size="2"
          weight="medium"
          align="center"
          style={{ color: "var(--gray-10)" }}
        >
          Select a report
        </Text>
        <Text
          size="1"
          align="center"
          mt="1"
          style={{ color: "var(--gray-9)", lineHeight: 1.35 }}
        >
          Pick a report from the list to see details, signals, and evidence.
        </Text>
      </Flex>
    </Flex>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function InboxSignalsTab() {
  const sortField = useInboxSignalsFilterStore((s) => s.sortField);
  const sortDirection = useInboxSignalsFilterStore((s) => s.sortDirection);
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const statusFilter = useInboxSignalsFilterStore((s) => s.statusFilter);
  const { data: signalSourceConfigs } = useSignalSourceConfigs();
  const hasSignalSources = signalSourceConfigs?.some((c) => c.enabled) ?? false;
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false);

  const windowFocused = useRendererWindowFocusStore((s) => s.focused);
  const isInboxView = useNavigationStore((s) => s.view.type === "inbox");
  const inboxPollingActive = windowFocused && isInboxView;

  const inboxQueryParams = useMemo(
    (): SignalReportsQueryParams => ({
      status: buildStatusFilterParam(statusFilter),
      ordering: buildSignalReportListOrdering(sortField, sortDirection),
    }),
    [statusFilter, sortField, sortDirection],
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

  const readyCount = useMemo(
    () => allReports.filter((r) => r.status === "ready").length,
    [allReports],
  );
  const processingCount = useMemo(
    () => allReports.filter((r) => r.status !== "ready").length,
    [allReports],
  );
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
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

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  const artefactsQuery = useInboxReportArtefacts(selectedReport?.id ?? "", {
    enabled: !!selectedReport,
  });
  const allArtefacts = artefactsQuery.data?.results ?? [];
  const visibleArtefacts = allArtefacts.filter(
    (a): a is SignalReportArtefact => a.type !== "suggested_reviewers",
  );
  const suggestedReviewers = useMemo(() => {
    const reviewerArtefact = allArtefacts.find(
      (a): a is SuggestedReviewersArtefact => a.type === "suggested_reviewers",
    );
    return reviewerArtefact?.content ?? [];
  }, [allArtefacts]);
  const artefactsUnavailableReason = artefactsQuery.data?.unavailableReason;
  const showArtefactsUnavailable =
    !artefactsQuery.isLoading &&
    (!!artefactsQuery.error || !!artefactsUnavailableReason);
  const artefactsUnavailableMessage = artefactsQuery.error
    ? "Evidence could not be loaded right now. You can still create a task from this report."
    : getArtefactsUnavailableMessage(artefactsUnavailableReason);

  const signalsQuery = useInboxReportSignals(selectedReport?.id ?? "", {
    enabled: !!selectedReport,
  });
  const signals = signalsQuery.data?.signals ?? [];

  const canActOnReport = !!selectedReport && selectedReport.status === "ready";

  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const projectId = useAuthStateValue((state) => state.projectId);
  const replayBaseUrl =
    cloudRegion && projectId
      ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
      : null;

  const { navigateToTaskInput, navigateToTask } = useNavigationStore();
  const draftActions = useDraftStore((s) => s.actions);
  const { invalidateTasks } = useCreateTask();
  const { githubIntegration, repositories } = useRepositoryIntegration();
  const cloudModeEnabled = useFeatureFlag("twig-cloud-mode-toggle");

  const isRunningCloudTask = useInboxCloudTaskStore((s) => s.isRunning);
  const showCloudConfirm = useInboxCloudTaskStore((s) => s.showConfirm);
  const selectedRepo = useInboxCloudTaskStore((s) => s.selectedRepo);
  const openCloudConfirm = useInboxCloudTaskStore((s) => s.openConfirm);
  const closeCloudConfirm = useInboxCloudTaskStore((s) => s.closeConfirm);
  const setSelectedRepo = useInboxCloudTaskStore((s) => s.setSelectedRepo);
  const runCloudTask = useInboxCloudTaskStore((s) => s.runCloudTask);

  const buildPrompt = useCallback(() => {
    if (!selectedReport) return null;
    return buildSignalTaskPrompt({
      report: selectedReport,
      artefacts: visibleArtefacts,
      signals,
      replayBaseUrl,
    });
  }, [selectedReport, visibleArtefacts, signals, replayBaseUrl]);

  const handleCreateTask = () => {
    if (!selectedReport || selectedReport.status !== "ready") {
      return;
    }
    const prompt = buildPrompt();
    if (!prompt) return;

    draftActions.setPendingContent("task-input", {
      segments: [{ type: "text", text: prompt }],
    });
    navigateToTaskInput();
  };

  const handleOpenCloudConfirm = useCallback(() => {
    openCloudConfirm(repositories[0] ?? null);
  }, [repositories, openCloudConfirm]);

  const selectedReportRef = useRef(selectedReport);
  selectedReportRef.current = selectedReport;

  const handleRunCloudTask = useCallback(async () => {
    const report = selectedReportRef.current;
    if (!report || report.status !== "ready") {
      return;
    }
    const prompt = buildPrompt();
    if (!prompt) return;

    const result = await runCloudTask({
      prompt,
      githubIntegrationId: githubIntegration?.id,
      reportId: report.id,
    });

    if (result.success && result.task) {
      invalidateTasks(result.task);
      navigateToTask(result.task);
    } else if (!result.success) {
      toast.error(result.error ?? "Failed to create cloud task");
    }
  }, [
    buildPrompt,
    runCloudTask,
    invalidateTasks,
    navigateToTask,
    githubIntegration?.id,
  ]);

  // Resize handle for left pane
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

  // ── Layout mode: full-width empty state vs two-pane ─────────────────────

  const hasReports = allReports.length > 0;
  const showTwoPaneLayout = hasReports || !!searchQuery.trim();

  // ── Determine right pane content (only used in two-pane mode) ──────────

  let rightPaneContent: React.ReactNode;

  if (selectedReport) {
    rightPaneContent = (
      <>
        <Flex
          direction="column"
          gap="2"
          px="3"
          py="2"
          className="shrink-0"
          style={{ borderBottom: "1px solid var(--gray-5)" }}
        >
          <Flex align="start" justify="between" gap="2">
            <Text
              size="1"
              weight="medium"
              className="block min-w-0 break-words text-[13px]"
            >
              {selectedReport.title ?? "Untitled signal"}
            </Text>
            <button
              type="button"
              onClick={() => setSelectedReportId(null)}
              className="shrink-0 rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
            >
              <XIcon size={14} />
            </button>
          </Flex>
          <Flex align="center" gap="1" wrap="wrap">
            <Button
              size="1"
              variant="soft"
              onClick={handleCreateTask}
              disabled={!canActOnReport}
              className="text-[12px]"
            >
              Create task
            </Button>
            {cloudModeEnabled && (
              <Button
                size="1"
                variant="solid"
                onClick={handleOpenCloudConfirm}
                disabled={
                  !canActOnReport ||
                  isRunningCloudTask ||
                  repositories.length === 0
                }
                className="text-[12px]"
              >
                <CloudIcon size={12} />
                {isRunningCloudTask ? "Running..." : "Run cloud"}
              </Button>
            )}
          </Flex>
          {!canActOnReport && selectedReport ? (
            <Text size="1" color="gray" className="text-[11px] leading-snug">
              {selectedReport.status === "pending_input"
                ? "This report needs input in PostHog before an agent can act on it."
                : "Research is still running — you can read context below, then create a task when status is Ready."}
            </Text>
          ) : null}
        </Flex>
        <ScrollArea
          type="auto"
          scrollbars="vertical"
          className="scroll-area-constrain-width"
          style={{ flex: 1 }}
        >
          <Flex direction="column" gap="2" p="2" className="min-w-0">
            {/* ── Description ─────────────────────────────────────── */}
            <SignalReportSummaryMarkdown
              content={selectedReport.summary}
              fallback="No summary available."
              variant="detail"
            />
            <Flex align="center" gap="2" wrap="wrap">
              <SignalReportPriorityBadge priority={selectedReport.priority} />
              <Badge variant="soft" color="gray" size="1">
                {selectedReport.signal_count} occurrences
              </Badge>
              <Badge variant="soft" color="gray" size="1">
                {selectedReport.relevant_user_count ?? 0} affected users
              </Badge>
            </Flex>

            {suggestedReviewers.length > 0 && (
              <Box>
                <Text
                  size="1"
                  weight="medium"
                  className="block text-[13px]"
                  mb="2"
                >
                  Suggested reviewers
                </Text>
                <Flex direction="column" gap="1">
                  {suggestedReviewers.map((reviewer) => (
                    <Flex key={reviewer.github_login} align="center" gap="2">
                      <GithubLogoIcon
                        size={14}
                        className="shrink-0 text-gray-10"
                      />
                      <Text size="1" className="text-[12px]">
                        {reviewer.user?.first_name ??
                          reviewer.github_name ??
                          reviewer.github_login}
                      </Text>
                      <a
                        href={`https://github.com/${reviewer.github_login}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-gray-9 hover:text-gray-11"
                      >
                        @{reviewer.github_login}
                      </a>
                    </Flex>
                  ))}
                </Flex>
              </Box>
            )}

            {/* ── Signals ─────────────────────────────────────────── */}
            {signals.length > 0 && (
              <Box>
                <Text
                  size="1"
                  weight="medium"
                  className="block text-[13px]"
                  mb="2"
                >
                  Signals ({signals.length})
                </Text>
                <Flex direction="column" gap="2">
                  {signals.map((signal) => (
                    <SignalCard key={signal.signal_id} signal={signal} />
                  ))}
                </Flex>
              </Box>
            )}
            {signalsQuery.isLoading && (
              <Text size="1" color="gray" className="block text-[12px]">
                Loading signals...
              </Text>
            )}

            {/* ── Evidence ────────────────────────────────────────── */}
            <Box>
              <Text
                size="1"
                weight="medium"
                className="block text-[13px]"
                mb="2"
              >
                Evidence
              </Text>
              {artefactsQuery.isLoading && (
                <Text size="1" color="gray" className="block text-[12px]">
                  Loading evidence...
                </Text>
              )}
              {showArtefactsUnavailable && (
                <Text size="1" color="gray" className="block text-[12px]">
                  {artefactsUnavailableMessage}
                </Text>
              )}
              {!artefactsQuery.isLoading &&
                !showArtefactsUnavailable &&
                visibleArtefacts.length === 0 && (
                  <Text size="1" color="gray" className="block text-[12px]">
                    No artefacts were returned for this signal.
                  </Text>
                )}

              <Flex direction="column" gap="1">
                {visibleArtefacts.map((artefact) => (
                  <Box
                    key={artefact.id}
                    className="rounded border border-gray-6 bg-gray-1 p-2"
                  >
                    <Text
                      size="1"
                      className="whitespace-pre-wrap text-pretty break-words text-[12px]"
                    >
                      {artefact.content.content}
                    </Text>
                    <Flex align="center" justify="between" mt="1" gap="2">
                      <Flex align="center" gap="1">
                        <ClockIcon size={12} className="text-gray-9" />
                        <Text size="1" color="gray" className="text-[12px]">
                          {artefact.content.start_time
                            ? new Date(
                                artefact.content.start_time,
                              ).toLocaleString()
                            : "Unknown time"}
                        </Text>
                      </Flex>
                      {replayBaseUrl && artefact.content.session_id && (
                        <a
                          href={`${replayBaseUrl}/${artefact.content.session_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] text-gray-11 hover:text-gray-12"
                        >
                          View replay
                          <ArrowSquareOutIcon size={12} />
                        </a>
                      )}
                    </Flex>
                  </Box>
                ))}
              </Flex>
            </Box>
          </Flex>
        </ScrollArea>
        {/* ── Research task logs (bottom preview + overlay) ─────── */}
        <ReportTaskLogs
          key={selectedReport.id}
          reportId={selectedReport.id}
          reportStatus={selectedReport.status}
        />
      </>
    );
  } else {
    rightPaneContent = <SelectReportPane />;
  }

  // ── Left pane content ───────────────────────────────────────────────────

  let leftPaneList: React.ReactNode;

  if (isLoading && allReports.length === 0 && hasSignalSources) {
    leftPaneList = (
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
  } else if (error) {
    leftPaneList = (
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
  } else if (reports.length === 0 && searchQuery.trim()) {
    leftPaneList = (
      <Flex direction="column" align="center" justify="center" gap="2" py="6">
        <Text size="1" color="gray" className="text-[12px]">
          No matching signals
        </Text>
      </Flex>
    );
  } else {
    leftPaneList = (
      <>
        {reports.map((report, index) => (
          <ReportCard
            key={report.id}
            index={index}
            report={report}
            isSelected={selectedReport?.id === report.id}
            onClick={() => setSelectedReportId(report.id)}
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

  // ── Skeleton rows for backdrop behind empty states ──────────────────────

  const skeletonBackdrop = (
    <Flex direction="column" style={{ opacity: 0.4 }}>
      {Array.from({ length: 8 }).map((_, index) => (
        <Flex
          // biome-ignore lint/suspicious/noArrayIndexKey: static decorative placeholders
          key={index}
          direction="column"
          gap="2"
          px="3"
          py="3"
          className="border-gray-5 border-b"
        >
          <Box className="h-[12px] w-[44%] rounded bg-gray-4" />
          <Box className="h-[11px] w-[82%] rounded bg-gray-3" />
        </Flex>
      ))}
    </Flex>
  );

  const searchDisabledReason =
    !hasReports && !searchQuery.trim()
      ? "No reports in the project\u2026 yet"
      : null;

  return (
    <>
      {showTwoPaneLayout ? (
        <Flex ref={containerRef} height="100%" style={{ minHeight: 0 }}>
          {/* ── Left pane: report list ───────────────────────────────── */}
          <Box
            style={{
              width: `${sidebarWidth}px`,
              minWidth: `${sidebarWidth}px`,
              maxWidth: `${sidebarWidth}px`,
              height: "100%",
              flexShrink: 0,
              borderRight: "1px solid var(--gray-5)",
              position: "relative",
            }}
          >
            <ScrollArea
              type="auto"
              className="scroll-area-constrain-width"
              style={{ height: "100%" }}
            >
              <Flex direction="column">
                <InboxLiveRail active={inboxPollingActive} />
                <SignalsToolbar
                  totalCount={totalCount}
                  filteredCount={reports.length}
                  isSearchActive={!!searchQuery.trim()}
                  livePolling={inboxPollingActive}
                  readyCount={readyCount}
                  processingCount={processingCount}
                />
                {leftPaneList}
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

          {/* ── Right pane: detail ───────────────────────────────────── */}
          <Flex
            direction="column"
            style={{
              flex: 1,
              minWidth: 0,
              height: "100%",
              position: "relative",
            }}
          >
            {rightPaneContent}
          </Flex>
        </Flex>
      ) : (
        /* ── Full-width empty state with skeleton backdrop ──────────── */
        <Box style={{ height: "100%", position: "relative" }}>
          <Flex direction="column">
            <SignalsToolbar
              totalCount={0}
              filteredCount={0}
              isSearchActive={false}
              searchDisabledReason={searchDisabledReason}
            />
            {skeletonBackdrop}
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
              />
            )}
          </Box>
        </Box>
      )}

      {/* ── Sources config dialog ──────────────────────────────────── */}
      <Dialog.Root open={sourcesDialogOpen} onOpenChange={setSourcesDialogOpen}>
        <Dialog.Content maxWidth="520px">
          <Flex align="center" justify="between" mb="3">
            <Dialog.Title size="3" mb="0">
              Signal sources
            </Dialog.Title>
            <Dialog.Close>
              <button
                type="button"
                className="rounded p-1 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
                aria-label="Close"
              >
                <XIcon size={16} />
              </button>
            </Dialog.Close>
          </Flex>
          <SignalSourcesSettings />
          <Flex justify="end" mt="4">
            {hasSignalSources ? (
              <Dialog.Close>
                <Button size="2">Back to Inbox</Button>
              </Dialog.Close>
            ) : (
              <Tooltip content="You haven't enabled any signal source yet!">
                <Button size="2" disabled>
                  Back to Inbox
                </Button>
              </Tooltip>
            )}
          </Flex>
        </Dialog.Content>
      </Dialog.Root>

      {/* ── Cloud task confirmation dialog ────────────────────────── */}
      <AlertDialog.Root
        open={showCloudConfirm}
        onOpenChange={(open) => {
          if (!open) closeCloudConfirm();
        }}
      >
        <AlertDialog.Content maxWidth="420px">
          <AlertDialog.Title>
            <Flex align="center" gap="2">
              <CloudIcon size={18} />
              <Text weight="bold">Run cloud task</Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2">
            <Flex direction="column" gap="3">
              <Text className="text-[13px]">
                This will create and run a cloud task from this signal report.
              </Text>
              {repositories.length > 1 ? (
                <Flex direction="column" gap="1">
                  <Text size="1" weight="medium" className="text-[12px]">
                    Target repository
                  </Text>
                  <Select.Root
                    value={selectedRepo ?? undefined}
                    onValueChange={setSelectedRepo}
                  >
                    <Select.Trigger className="text-[13px]" />
                    <Select.Content>
                      {repositories.map((repo) => (
                        <Select.Item
                          key={repo}
                          value={repo}
                          className="text-[13px]"
                        >
                          {repo}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                </Flex>
              ) : selectedRepo ? (
                <Flex direction="column" gap="1">
                  <Text size="1" weight="medium" className="text-[12px]">
                    Target repository
                  </Text>
                  <Text size="2" className="text-[13px]">
                    {selectedRepo}
                  </Text>
                </Flex>
              ) : null}
            </Flex>
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" onClick={() => void handleRunCloudTask()}>
                <CloudIcon size={14} />
                Run
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
}
