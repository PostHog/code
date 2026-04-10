import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import {
  useInboxReportArtefacts,
  useInboxReportSignals,
} from "@features/inbox/hooks/useInboxReports";
import { useInboxCloudTaskStore } from "@features/inbox/stores/inboxCloudTaskStore";
import { buildSignalTaskPrompt } from "@features/inbox/utils/buildSignalTaskPrompt";
import { useDraftStore } from "@features/message-editor/stores/draftStore";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useMeQuery } from "@hooks/useMeQuery";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  ClockIcon,
  Cloud as CloudIcon,
  CommandIcon,
  EyeIcon,
  GithubLogoIcon,
  KeyReturnIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Box,
  Button,
  Flex,
  ScrollArea,
  Select,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import type {
  ActionabilityJudgmentArtefact,
  ActionabilityJudgmentContent,
  PriorityJudgmentArtefact,
  SignalFindingArtefact,
  SignalReport,
  SignalReportArtefact,
  SignalReportArtefactsResponse,
  SuggestedReviewer,
  SuggestedReviewersArtefact,
} from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";
import { SignalReportActionabilityBadge } from "../utils/SignalReportActionabilityBadge";
import { SignalReportPriorityBadge } from "../utils/SignalReportPriorityBadge";
import { SignalReportStatusBadge } from "../utils/SignalReportStatusBadge";
import { SignalReportSummaryMarkdown } from "../utils/SignalReportSummaryMarkdown";
import { ReportTaskLogs } from "./ReportTaskLogs";
import { SignalCard } from "./SignalCard";

function isSuggestedReviewerRowMe(
  reviewer: SuggestedReviewer,
  meUuid: string | undefined,
): boolean {
  return !!reviewer.user?.uuid && !!meUuid && meUuid === reviewer.user.uuid;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function DetailRow({
  label,
  value,
  explanation,
}: {
  label: string;
  value: ReactNode;
  explanation?: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasExplanation = !!explanation;

  return (
    <Box>
      <Flex align="center" gap="2">
        <Text
          size="2"
          className="w-[90px] shrink-0 text-[13px]"
          style={{ color: "var(--gray-10)" }}
        >
          {label}
        </Text>
        {value}
        {hasExplanation && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-0.5 rounded px-1 py-0.5 text-[13px] text-gray-9 hover:bg-gray-3 hover:text-gray-11"
          >
            {expanded ? (
              <CaretDownIcon size={12} />
            ) : (
              <CaretRightIcon size={12} />
            )}
            Why?
          </button>
        )}
      </Flex>
      {expanded && explanation && (
        <Text
          size="1"
          color="gray"
          className="mt-1 block text-pretty text-[13px] leading-relaxed"
          style={{ paddingLeft: 90 }}
        >
          {explanation}
        </Text>
      )}
    </Box>
  );
}

// ── ReportDetailPane ────────────────────────────────────────────────────────

interface ReportDetailPaneProps {
  report: SignalReport;
  onClose: () => void;
}

export function ReportDetailPane({ report, onClose }: ReportDetailPaneProps) {
  // ── Auth / URLs ─────────────────────────────────────────────────────────
  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const projectId = useAuthStateValue((state) => state.projectId);
  const { data: me } = useMeQuery();
  const replayBaseUrl =
    cloudRegion && projectId
      ? `${getCloudUrlFromRegion(cloudRegion)}/project/${projectId}/replay`
      : null;

  // ── Report data ─────────────────────────────────────────────────────────
  const artefactsQuery = useInboxReportArtefacts(report.id, {
    enabled: true,
  });
  const allArtefacts = artefactsQuery.data?.results ?? [];

  const videoSegments = allArtefacts.filter(
    (a): a is SignalReportArtefact => a.type === "video_segment",
  );

  const suggestedReviewers = useMemo(() => {
    const reviewerArtefact = allArtefacts.find(
      (a): a is SuggestedReviewersArtefact => a.type === "suggested_reviewers",
    );
    return reviewerArtefact?.content ?? [];
  }, [allArtefacts]);

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

  const actionabilityJudgment =
    useMemo((): ActionabilityJudgmentContent | null => {
      for (const a of allArtefacts) {
        if (a.type === "actionability_judgment") {
          return (a as ActionabilityJudgmentArtefact).content;
        }
      }
      return null;
    }, [allArtefacts]);

  const priorityExplanation = useMemo((): string | null => {
    for (const a of allArtefacts) {
      if (a.type === "priority_judgment") {
        return (a as PriorityJudgmentArtefact).content.explanation || null;
      }
    }
    return null;
  }, [allArtefacts]);

  const artefactsUnavailableReason = artefactsQuery.data?.unavailableReason;
  const showArtefactsUnavailable =
    !artefactsQuery.isLoading &&
    (!!artefactsQuery.error || !!artefactsUnavailableReason);
  const artefactsUnavailableMessage = artefactsQuery.error
    ? "Evidence could not be loaded right now. You can still create a task from this report."
    : getArtefactsUnavailableMessage(artefactsUnavailableReason);

  const signalsQuery = useInboxReportSignals(report.id, {
    enabled: true,
  });
  const signals = signalsQuery.data?.signals ?? [];

  // ── Task creation ───────────────────────────────────────────────────────
  const { navigateToTaskInput, navigateToTask } = useNavigationStore();
  const draftActions = useDraftStore((s) => s.actions);
  const { invalidateTasks } = useCreateTask();
  const { repositories, getIntegrationIdForRepo } = useRepositoryIntegration();
  const cloudModeEnabled = useFeatureFlag("twig-cloud-mode-toggle");

  const isRunningCloudTask = useInboxCloudTaskStore((s) => s.isRunning);
  const showCloudConfirm = useInboxCloudTaskStore((s) => s.showConfirm);
  const selectedRepo = useInboxCloudTaskStore((s) => s.selectedRepo);
  const openCloudConfirm = useInboxCloudTaskStore((s) => s.openConfirm);
  const closeCloudConfirm = useInboxCloudTaskStore((s) => s.closeConfirm);
  const setSelectedRepo = useInboxCloudTaskStore((s) => s.setSelectedRepo);
  const runCloudTask = useInboxCloudTaskStore((s) => s.runCloudTask);

  const canActOnReport = report.status === "ready";

  const buildPrompt = useCallback(() => {
    return buildSignalTaskPrompt({
      report,
      artefacts: videoSegments,
      signals,
      replayBaseUrl,
    });
  }, [report, videoSegments, signals, replayBaseUrl]);

  const handleCreateTask = useCallback(() => {
    if (!canActOnReport) return;
    const prompt = buildPrompt();
    if (!prompt) return;

    draftActions.setPendingContent("task-input", {
      segments: [{ type: "text", text: prompt }],
    });
    navigateToTaskInput();
  }, [canActOnReport, buildPrompt, draftActions, navigateToTaskInput]);

  // Cmd/Ctrl+Enter shortcut to create task
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleCreateTask();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleCreateTask]);

  const handleOpenCloudConfirm = useCallback(() => {
    openCloudConfirm(repositories[0] ?? null);
  }, [repositories, openCloudConfirm]);

  const handleRunCloudTask = useCallback(async () => {
    if (!canActOnReport) return;
    const prompt = buildPrompt();
    if (!prompt) return;

    const result = await runCloudTask({
      prompt,
      githubIntegrationId: selectedRepo
        ? getIntegrationIdForRepo(selectedRepo)
        : undefined,
      reportId: report.id,
    });

    if (result.success && result.task) {
      invalidateTasks(result.task);
      navigateToTask(result.task);
    } else if (!result.success) {
      toast.error(result.error ?? "Failed to create cloud task");
    }
  }, [
    canActOnReport,
    buildPrompt,
    runCloudTask,
    invalidateTasks,
    navigateToTask,
    selectedRepo,
    getIntegrationIdForRepo,
    report.id,
  ]);

  return (
    <>
      {/* ── Header bar ──────────────────────────────────────────── */}
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
            {report.title ?? "Untitled signal"}
          </Text>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
          >
            <XIcon size={14} />
          </button>
        </Flex>
        <Flex align="center" justify="between" gap="2">
          <Flex align="center" gap="1">
            <Button
              size="1"
              variant="soft"
              onClick={handleCreateTask}
              disabled={!canActOnReport}
              className="text-[12px]"
            >
              <CloudIcon size={12} />
              {isRunningCloudTask ? "Running..." : "Run task"}
              <span className="ml-1 inline-flex items-center gap-px text-gray-9">
                <CommandIcon size={11} />
                <KeyReturnIcon size={11} />
              </span>
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
          <SignalReportStatusBadge status={report.status} />
        </Flex>
      </Flex>

      {/* ── Scrollable detail area ──────────────────────────────── */}
      <ScrollArea
        type="auto"
        scrollbars="vertical"
        className="scroll-area-constrain-width"
        style={{ flex: 1 }}
      >
        <Flex direction="column" gap="2" p="2" className="min-w-0">
          {/* ── Description ─────────────────────────────────────── */}
          {report.status !== "ready" ? (
            <Tooltip content="This is a preliminary description. A full researched summary will replace it when the research agent completes its work.">
              <div className="cursor-help">
                <SignalReportSummaryMarkdown
                  content={report.summary}
                  fallback="No summary available."
                  variant="detail"
                  pending
                />
              </div>
            </Tooltip>
          ) : (
            <SignalReportSummaryMarkdown
              content={report.summary}
              fallback="No summary available."
              variant="detail"
            />
          )}

          {/* ── Priority / Actionability ──────────────────────── */}
          {(report.priority || report.actionability) && (
            <Flex
              direction="column"
              gap="1"
              py="2"
              style={{ borderTop: "1px solid var(--gray-5)" }}
            >
              {report.priority && (
                <DetailRow
                  label="Priority"
                  value={
                    <SignalReportPriorityBadge priority={report.priority} />
                  }
                  explanation={priorityExplanation}
                />
              )}
              {report.actionability && (
                <DetailRow
                  label="Actionability"
                  value={
                    <SignalReportActionabilityBadge
                      actionability={report.actionability}
                    />
                  }
                  explanation={actionabilityJudgment?.explanation}
                />
              )}
            </Flex>
          )}

          {/* ── Already-addressed warning ─────────────────────── */}
          {(report.already_addressed ??
            actionabilityJudgment?.already_addressed) && (
            <Flex
              align="center"
              gap="2"
              px="2"
              py="1"
              className="rounded border border-amber-6 bg-amber-2"
            >
              <WarningIcon
                size={14}
                weight="fill"
                style={{ color: "var(--amber-9)" }}
                className="shrink-0"
              />
              <Text
                size="1"
                className="text-[12px]"
                style={{ color: "var(--amber-11)" }}
              >
                This issue may already be addressed in recent code changes.
              </Text>
            </Flex>
          )}

          {/* ── Suggested reviewers ─────────────────────────────── */}
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
                {suggestedReviewers.map((reviewer) => {
                  const isMe = isSuggestedReviewerRowMe(reviewer, me?.uuid);
                  return (
                    <Flex
                      key={reviewer.github_login}
                      align="center"
                      gap="2"
                      wrap="wrap"
                    >
                      <GithubLogoIcon
                        size={14}
                        className="shrink-0 text-gray-10"
                      />
                      <Text size="1" className="text-[12px]">
                        {reviewer.user?.first_name ??
                          reviewer.github_name ??
                          reviewer.github_login}
                      </Text>
                      {isMe && (
                        <Tooltip content="You are a suggested reviewer">
                          <span
                            className="inline-flex shrink-0 items-center rounded-sm px-1 py-px"
                            style={{
                              color: "var(--amber-11)",
                              backgroundColor: "var(--amber-3)",
                              border: "1px solid var(--amber-6)",
                            }}
                          >
                            <EyeIcon size={10} weight="bold" />
                          </span>
                        </Tooltip>
                      )}
                      <a
                        href={`https://github.com/${reviewer.github_login}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] text-gray-9 hover:text-gray-11"
                      >
                        @{reviewer.github_login}
                        <ArrowSquareOutIcon size={10} />
                      </a>
                      {reviewer.relevant_commits.length > 0 && (
                        <span className="text-[11px] text-gray-9">
                          {reviewer.relevant_commits.map((commit, i) => (
                            <span key={commit.sha}>
                              {i > 0 && ", "}
                              <Tooltip content={commit.reason || undefined}>
                                <a
                                  href={commit.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-mono text-gray-9 hover:text-gray-11"
                                >
                                  {commit.sha.slice(0, 7)}
                                </a>
                              </Tooltip>
                            </span>
                          ))}
                        </span>
                      )}
                    </Flex>
                  );
                })}
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

          {/* ── Evidence (session segments) ─────────────────────── */}
          <Box>
            <Text size="1" weight="medium" className="block text-[13px]" mb="2">
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
              videoSegments.length === 0 && (
                <Text size="1" color="gray" className="block text-[12px]">
                  No session segments available for this report.
                </Text>
              )}
            <Flex direction="column" gap="1">
              {videoSegments.map((artefact) => (
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
        key={report.id}
        reportId={report.id}
        reportStatus={report.status}
      />

      {/* ── Cloud task confirmation dialog ────────────────────── */}
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
