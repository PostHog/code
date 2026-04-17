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
  GitPullRequestIcon,
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
import { getPrNumberFromUrl, ReportTaskLogs } from "./ReportTaskLogs";
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

  /** Matches server autostart rules: ready + immediately actionable + not already fixed. */
  const canCreateImplementationPr =
    report.status === "ready" &&
    report.actionability === "immediately_actionable" &&
    report.already_addressed !== true;

  const [implementationPrUrl, setImplementationPrUrl] = useState<string | null>(
    null,
  );
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
        px="3"
        py="2"
        className="shrink-0"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Flex align="center" gap="2" className="min-w-0">
          <SignalReportStatusBadge status={report.status} />
          <Text
            size="1"
            weight="medium"
            className="block min-w-0 break-words text-[13px]"
          >
            {report.title ?? "Untitled signal"}
          </Text>
          {implementationPrUrl && (
            <Tooltip content={implementationPrUrl}>
              <a
                href={implementationPrUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-green-5 px-2 py-0.5 font-medium text-[11px] text-green-12 hover:bg-green-6"
              >
                <GitPullRequestIcon size={12} weight="bold" />
                {getPrNumberFromUrl(implementationPrUrl) ?? "PR"}
              </a>
            </Tooltip>
          )}
        </Flex>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-0.5 text-gray-11 hover:bg-gray-3 hover:text-gray-12"
        >
          <XIcon size={14} />
        </button>
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
                      <img
                        src={`https://github.com/${reviewer.github_login}.png?size=28`}
                        alt=""
                        className="github-avatar shrink-0 rounded-full"
                        style={{ width: 18, height: 18 }}
                        onLoad={(e) => e.currentTarget.classList.add("loaded")}
                      />
                      <Text size="1" className="text-[12px]">
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

          {/* ── Session problem evidence ─────────────────────────── */}
          {sessionProblemSignals.length > 0 && (
            <Box>
              <Text
                size="1"
                weight="medium"
                className="block text-[13px]"
                mb="2"
              >
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
        onPrUrlChange={setImplementationPrUrl}
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
              <Text weight="bold">Run cloud task</Text>
            </Flex>
          </AlertDialog.Title>
          <AlertDialog.Description size="2" className="overflow-visible">
            <Flex direction="column" gap="3" className="overflow-visible">
              <Text className="text-[13px]">
                This will create and run a cloud task from this signal report.
                You can edit the prompt below before running.
              </Text>
              <Flex direction="column" gap="1">
                <Text size="1" weight="medium" className="text-[12px]">
                  Task prompt
                </Text>
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
                  <Text size="1" weight="medium" className="text-[12px]">
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
