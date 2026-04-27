import { Badge } from "@components/ui/Badge";
import { GitHubRepoPicker } from "@features/folder-picker/components/GitHubRepoPicker";
import {
  useInboxReportArtefacts,
  useInboxReportSignals,
} from "@features/inbox/hooks/useInboxReports";
import { useInboxCloudTaskStore } from "@features/inbox/stores/inboxCloudTaskStore";
import { buildSignalTaskPrompt } from "@features/inbox/utils/buildSignalTaskPrompt";
import { useCreateTask } from "@features/tasks/hooks/useTasks";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useMeQuery } from "@hooks/useMeQuery";
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretRightIcon,
  Cloud as CloudIcon,
  EyeIcon,
  LinkSimpleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Box,
  Button,
  Flex,
  ScrollArea,
  Text,
  TextArea,
  Tooltip,
} from "@radix-ui/themes";
import { getDeeplinkProtocol } from "@shared/deeplink";
import type {
  ActionabilityJudgmentArtefact,
  ActionabilityJudgmentContent,
  PriorityJudgmentArtefact,
  SignalFindingArtefact,
  SignalReport,
  SuggestedReviewer,
  SuggestedReviewersArtefact,
} from "@shared/types";
import { useNavigationStore } from "@stores/navigationStore";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
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
        <Text className="w-[90px] shrink-0 text-(--gray-10) text-[13px]">
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
          color="gray"
          className="mt-1 block text-pretty pl-[90px] text-[13px] leading-relaxed"
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
  const { data: me } = useMeQuery();

  // ── Report data ─────────────────────────────────────────────────────────
  const artefactsQuery = useInboxReportArtefacts(report.id, {
    enabled: true,
  });
  const allArtefacts = artefactsQuery.data?.results ?? [];

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
  void artefactsUnavailableReason; // TODO: wire up unavailable UI

  const signalsQuery = useInboxReportSignals(report.id, {
    enabled: true,
  });
  const allSignals = signalsQuery.data?.signals ?? [];
  const sessionProblemSignals = allSignals.filter(
    (s) =>
      s.source_product === "session_replay" &&
      s.source_type === "session_problem",
  );
  const signals = allSignals.filter(
    (s) =>
      !(
        s.source_product === "session_replay" &&
        s.source_type === "session_problem"
      ),
  );

  // ── Task creation ───────────────────────────────────────────────────────
  const { navigateToTask } = useNavigationStore();
  const { invalidateTasks } = useCreateTask();
  const { repositories, getIntegrationIdForRepo, isLoadingRepos } =
    useRepositoryIntegration();
  const showCloudConfirm = useInboxCloudTaskStore((s) => s.showConfirm);
  const selectedRepo = useInboxCloudTaskStore((s) => s.selectedRepo);
  const openCloudConfirm = useInboxCloudTaskStore((s) => s.openConfirm);
  const closeCloudConfirm = useInboxCloudTaskStore((s) => s.closeConfirm);
  const setSelectedRepo = useInboxCloudTaskStore((s) => s.setSelectedRepo);
  const runCloudTask = useInboxCloudTaskStore((s) => s.runCloudTask);

  /** Matches server autostart rules: ready (or awaiting user input) + immediately actionable + not already fixed. */
  const canCreateImplementationPr =
    (report.status === "ready" || report.status === "pending_input") &&
    report.actionability === "immediately_actionable" &&
    report.already_addressed !== true;

  const [cloudPromptDraft, setCloudPromptDraft] = useState("");
  const cloudRepoPickerAnchorRef = useRef<HTMLDivElement>(null);

  const buildPrompt = useCallback(() => {
    const repository = selectedRepo ?? repositories[0] ?? "";
    return buildSignalTaskPrompt({
      report,
      repository,
      priorityExplanation,
    });
  }, [report, selectedRepo, repositories, priorityExplanation]);

  useEffect(() => {
    if (showCloudConfirm) {
      setCloudPromptDraft(buildPrompt() ?? "");
    }
  }, [showCloudConfirm, buildPrompt]);

  const handleOpenCloudConfirm = useCallback(() => {
    openCloudConfirm(repositories[0] ?? null);
  }, [repositories, openCloudConfirm]);

  // Cmd/Ctrl+Enter while a single report is selected mirrors the "Create PR" button.
  useEffect(() => {
    if (!canCreateImplementationPr) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (!(e.metaKey || e.ctrlKey)) return;
      if (
        document.querySelector(
          "[data-radix-popper-content-wrapper], [role='dialog'][data-state='open']",
        )
      ) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target?.closest("input, select, textarea, [contenteditable='true']")
      ) {
        return;
      }
      e.preventDefault();
      handleOpenCloudConfirm();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [canCreateImplementationPr, handleOpenCloudConfirm]);

  const handleRunCloudTask = useCallback(async () => {
    if (!canCreateImplementationPr) return;
    const prompt = cloudPromptDraft.trim();
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
    canCreateImplementationPr,
    cloudPromptDraft,
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
        align="center"
        justify="between"
        gap="2"
        py="2"
        className="shrink-0 border-b border-b-(--gray-5) @2xl:px-6 @3xl:px-8 @4xl:px-10 @5xl:px-12 @lg:px-4 @md:px-3 @xl:px-5 px-2"
      >
        <Flex align="center" gap="2" className="min-w-0">
          <SignalReportStatusBadge status={report.status} />
          <Text
            className={`block min-w-0 text-balance break-words text-base ${report.status === "ready" ? "font-bold" : "font-medium"}`}
          >
            {report.title ?? "Untitled signal"}
          </Text>
        </Flex>
        <Flex align="center" gap="1" className="shrink-0">
          <Tooltip content="Copy link to this report">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(
                    `${getDeeplinkProtocol(import.meta.env.DEV)}://inbox/${report.id}`,
                  );
                  toast.success("Link copied");
                } catch {
                  toast.error("Failed to copy link");
                }
              }}
              aria-label="Copy link to this report"
              className="rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
            >
              <LinkSimpleIcon size={14} />
            </button>
          </Tooltip>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close report detail"
            className="rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
          >
            <XIcon size={14} />
          </button>
        </Flex>
      </Flex>

      {/* ── Scrollable detail area ──────────────────────────────── */}
      <ScrollArea
        type="auto"
        scrollbars="vertical"
        className="scroll-area-constrain-width flex-1"
      >
        <Flex
          direction="column"
          gap="2"
          className="min-w-0 @2xl:px-6 @3xl:px-8 @4xl:px-10 @5xl:px-12 @lg:px-4 @md:px-3 @xl:px-5 px-2 @2xl:pt-3 @3xl:pt-4 @4xl:pt-5 @5xl:pt-6 @lg:pt-2 @md:pt-1.5 @xl:pt-2.5 pt-1 @2xl:pb-6 @3xl:pb-8 @4xl:pb-10 @5xl:pb-12 @lg:pb-4 @md:pb-3 @xl:pb-5 pb-2"
        >
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
              className="border-t border-t-(--gray-5)"
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
                className="shrink-0 text-(--amber-9)"
              />
              <Text className="text-(--amber-11) text-[12px]">
                This issue may already be addressed in recent code changes.
              </Text>
            </Flex>
          )}

          {/* ── Suggested reviewers ─────────────────────────────── */}
          {suggestedReviewers.length > 0 && (
            <Box>
              <Text className="block font-medium text-sm" mb="2">
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
                      <img
                        src={`https://github.com/${reviewer.github_login}.png?size=28`}
                        alt=""
                        className="github-avatar h-[18px] w-[18px] shrink-0 rounded-full"
                        onLoad={(e) => e.currentTarget.classList.add("loaded")}
                      />
                      <Text className="text-[12px]">
                        {reviewer.user?.first_name ??
                          reviewer.github_name ??
                          reviewer.github_login}
                      </Text>
                      {isMe && (
                        <Tooltip content="You are a suggested reviewer">
                          <Badge color="amber" className="!py-1 !text-[8px]">
                            <EyeIcon
                              size={8}
                              weight="bold"
                              className="shrink-0"
                            />
                          </Badge>
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
            <Box mt="4">
              <Text className="block font-medium text-sm" mb="2">
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
            <Text color="gray" className="block text-[12px]">
              Loading signals...
            </Text>
          )}

          {/* ── Session problem evidence ─────────────────────────── */}
          {sessionProblemSignals.length > 0 && (
            <Box>
              <Text className="block font-medium text-[13px]" mb="2">
                Evidence ({sessionProblemSignals.length})
              </Text>
              <Flex direction="column" gap="2">
                {sessionProblemSignals.map((signal) => (
                  <SignalCard
                    key={signal.signal_id}
                    signal={signal}
                    finding={signalFindings.get(signal.signal_id)}
                  />
                ))}
              </Flex>
            </Box>
          )}
        </Flex>
      </ScrollArea>

      {/* ── Research task logs (bottom preview + overlay) ─────── */}
      <ReportTaskLogs
        key={report.id}
        reportId={report.id}
        reportStatus={report.status}
        onRunInCloud={
          canCreateImplementationPr ? handleOpenCloudConfirm : undefined
        }
      />

      {/* ── Cloud task confirmation dialog ────────────────────── */}
      <AlertDialog.Root
        open={showCloudConfirm}
        onOpenChange={(open) => {
          if (!open) closeCloudConfirm();
        }}
      >
        <AlertDialog.Content maxWidth="560px" className="overflow-visible">
          <AlertDialog.Title>
            <Flex align="center" gap="2">
              <CloudIcon size={18} />
              <Text className="font-bold">Run cloud task</Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description className="overflow-visible text-sm">
            <Flex direction="column" gap="3" className="overflow-visible">
              <Text className="text-[13px]">
                This will create and run a cloud task from this signal report.
                You can edit the prompt below before running.
              </Text>
              <Flex direction="column" gap="1">
                <Text className="font-medium text-[12px]">Task prompt</Text>
                <TextArea
                  size="2"
                  rows={10}
                  value={cloudPromptDraft}
                  onChange={(e) => setCloudPromptDraft(e.target.value)}
                  className="min-h-[140px] resize-y font-mono text-[12px] leading-relaxed"
                  placeholder="Describe what the agent should do…"
                />
              </Flex>
              <Box ref={cloudRepoPickerAnchorRef} className="overflow-visible">
                <Flex direction="column" gap="1">
                  <Text className="font-medium text-[12px]">
                    Target repository
                  </Text>
                  <GitHubRepoPicker
                    value={selectedRepo}
                    onChange={setSelectedRepo}
                    repositories={repositories}
                    isLoading={isLoadingRepos}
                    placeholder="Select repository..."
                    size="1"
                    anchor={cloudRepoPickerAnchorRef}
                    showSearchInput={false}
                  />
                </Flex>
              </Box>
            </Flex>
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
                disabled={!cloudPromptDraft.trim()}
                onClick={() => void handleRunCloudTask()}
              >
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
