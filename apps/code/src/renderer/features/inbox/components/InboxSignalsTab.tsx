import { ResizableSidebar } from "@components/ResizableSidebar";
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
  filterReportsBySearch,
} from "@features/inbox/utils/filterReports";
import {
  INBOX_PIPELINE_STATUS_FILTER,
  INBOX_REFETCH_INTERVAL_MS,
} from "@features/inbox/utils/inboxConstants";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowSquareOutIcon,
  ClockIcon,
  Cloud as CloudIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Flex,
  ScrollArea,
  Select,
  Text,
} from "@radix-ui/themes";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import type {
  SignalFindingArtefact,
  SignalReportArtefact,
  SignalReportArtefactsResponse,
  SignalReportsQueryParams,
} from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import { useRendererWindowFocusStore } from "@stores/rendererWindowFocusStore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { SignalsErrorState, SignalsLoadingState } from "./InboxEmptyStates";
import { InboxWarmingUpState } from "./InboxWarmingUpState";
import { ReportCard } from "./ReportCard";
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

export function InboxSignalsTab() {
  const sortField = useInboxSignalsFilterStore((s) => s.sortField);
  const sortDirection = useInboxSignalsFilterStore((s) => s.sortDirection);
  const searchQuery = useInboxSignalsFilterStore((s) => s.searchQuery);
  const { data: signalSourceConfigs } = useSignalSourceConfigs();
  const hasSignalSources = signalSourceConfigs?.some((c) => c.enabled) ?? false;
  const openSettings = useSettingsDialogStore((s) => s.open);

  const windowFocused = useRendererWindowFocusStore((s) => s.focused);
  const isInboxView = useNavigationStore((s) => s.view.type === "inbox");
  const inboxPollingActive = windowFocused && isInboxView;

  const inboxQueryParams = useMemo(
    (): SignalReportsQueryParams => ({
      status: INBOX_PIPELINE_STATUS_FILTER,
      ordering: buildSignalReportListOrdering(sortField, sortDirection),
    }),
    [sortField, sortDirection],
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
  const sidebarOpen = useInboxSignalsSidebarStore((state) => state.open);
  const sidebarWidth = useInboxSignalsSidebarStore((state) => state.width);
  const sidebarIsResizing = useInboxSignalsSidebarStore(
    (state) => state.isResizing,
  );
  const setSidebarOpen = useInboxSignalsSidebarStore((state) => state.setOpen);
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
      setSidebarOpen(false);
    }
  }, [reports, selectedReportId, setSidebarOpen]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [reports, selectedReportId],
  );

  const artefactsQuery = useInboxReportArtefacts(selectedReport?.id ?? "", {
    enabled: !!selectedReport,
  });
  const allArtefacts = artefactsQuery.data?.results ?? [];
  const visibleArtefacts = allArtefacts.filter(
    (a): a is SignalReportArtefact => a.type === "video_segment",
  );
  const signalFindings = useMemo(() => {
    const map = new Map<string, SignalFindingArtefact["content"]>();
    for (const a of allArtefacts) {
      if (a.type === "signal_finding") {
        const finding = a as SignalFindingArtefact;
        map.set(finding.content.signal_id, finding.content);
      }
    }
    return map;
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

  if (isLoading) {
    return <SignalsLoadingState />;
  }

  if (error) {
    return (
      <SignalsErrorState
        onRetry={() => {
          void refetch();
        }}
        isRetrying={isFetching}
      />
    );
  }

  if (allReports.length === 0) {
    if (!hasSignalSources) {
      return (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="5"
          height="100%"
          px="5"
          style={{ maxWidth: 480, margin: "0 auto" }}
        >
          <Flex direction="column" gap="2" style={{ width: "100%" }}>
            <Text
              size="2"
              weight="medium"
              align="center"
              style={{ color: "var(--gray-12)" }}
            >
              Enable Inbox
            </Text>
            <Text size="1" align="center" style={{ color: "var(--gray-11)" }}>
              Inbox automatically analyzes your product data and prioritizes
              actionable tasks. Choose which sources to enable for this project.
            </Text>
          </Flex>
          <Button size="2" onClick={() => openSettings("signals")}>
            Configure signal sources
          </Button>
        </Flex>
      );
    }
    return <InboxWarmingUpState />;
  }

  return (
    <Flex height="100%" style={{ minHeight: 0 }}>
      <Box flexGrow="1" style={{ minWidth: 0 }}>
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
            {reports.length === 0 && searchQuery.trim() ? (
              <Flex
                direction="column"
                align="center"
                justify="center"
                gap="2"
                py="6"
              >
                <Text size="1" color="gray" className="text-[12px]">
                  No matching signals
                </Text>
              </Flex>
            ) : null}
            {reports.map((report, index) => (
              <ReportCard
                key={report.id}
                index={index}
                report={report}
                isSelected={selectedReport?.id === report.id}
                onClick={() => {
                  setSelectedReportId(report.id);
                  setSidebarOpen(true);
                }}
              />
            ))}
            <LoadMoreTrigger
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
            />
          </Flex>
        </ScrollArea>
      </Box>

      <ResizableSidebar
        open={sidebarOpen && !!selectedReport}
        width={sidebarWidth}
        setWidth={setSidebarWidth}
        isResizing={sidebarIsResizing}
        setIsResizing={setSidebarIsResizing}
        side="right"
      >
        {selectedReport ? (
          <>
            <Flex
              direction="column"
              gap="2"
              px="3"
              py="2"
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
                  onClick={() => {
                    setSidebarOpen(false);
                    setSelectedReportId(null);
                  }}
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
                <Text
                  size="1"
                  color="gray"
                  className="text-[11px] leading-snug"
                >
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
              style={{ height: "calc(100% - 41px)" }}
            >
              <Flex direction="column" gap="2" p="2" className="min-w-0">
                <SignalReportSummaryMarkdown
                  content={selectedReport.summary}
                  fallback="No summary available."
                  variant="detail"
                />
                <Flex align="center" gap="2" wrap="wrap">
                  <SignalReportPriorityBadge
                    priority={selectedReport.priority}
                  />
                  <Badge variant="soft" color="gray" size="1">
                    {selectedReport.signal_count} occurrences
                  </Badge>
                  <Badge variant="soft" color="gray" size="1">
                    {selectedReport.relevant_user_count ?? 0} affected users
                  </Badge>
                </Flex>

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
                        <SignalCard
                          key={signal.signal_id}
                          signal={signal}
                          finding={signalFindings.get(signal.signal_id)}
                        />
                      ))}
                    </Flex>
                  </Box>
                )}
                {signalsQuery.isLoading && (
                  <Text size="1" color="gray" className="block text-[12px]">
                    Loading signals...
                  </Text>
                )}

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
                        No session segments available for this report.
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
          </>
        ) : null}
      </ResizableSidebar>

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
    </Flex>
  );
}
