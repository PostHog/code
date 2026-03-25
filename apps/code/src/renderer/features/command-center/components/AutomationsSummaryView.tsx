import { MarkdownRenderer } from "@features/editor/components/MarkdownRenderer";
import {
  CheckCircle,
  Lightning,
  Trash,
  Warning,
  X,
} from "@phosphor-icons/react";
import { Badge, Button, Flex, ScrollArea, Text } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import type { Automation, AutomationRunInfo } from "@shared/types/automations";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSummary } from "../hooks/useSummary";
import {
  getGridDimensions,
  useCommandCenterStore,
} from "../stores/commandCenterStore";

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function AutomationGridCell({
  run,
  automationName,
  zoom,
  onDismiss,
}: {
  run: AutomationRunInfo;
  automationName: string;
  zoom: number;
  onDismiss: (runId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = run.status === "success";
  const displayTime = run.completedAt ?? run.startedAt;
  const summarizeMode = useCommandCenterStore((s) => s.summarize);

  // When summarize is on, use LLM summary. Otherwise use text before --- separator.
  const showSummary = summarizeMode || !expanded;
  const { summary: llmSummary, loading: summaryLoading } = useSummary(
    summarizeMode && run.output ? run.output : null,
  );

  // Fallback: text before "---" separator for non-LLM mode
  const quickSummary = useMemo(() => {
    if (!run.output) return null;
    const sep = run.output.indexOf("\n\n---\n");
    if (sep !== -1) return run.output.slice(0, sep).trim();
    const firstBreak = run.output.indexOf("\n\n");
    if (firstBreak !== -1 && firstBreak < 500)
      return run.output.slice(0, firstBreak).trim();
    return run.output;
  }, [run.output]);

  return (
    <div
      className="relative overflow-hidden bg-gray-1"
      style={{ zoom: zoom !== 1 ? zoom : undefined }}
    >
      <Flex direction="column" height="100%">
        {/* Header */}
        <Flex
          align="center"
          gap="2"
          px="2"
          py="1"
          className="shrink-0 border-gray-6 border-b"
        >
          {isSuccess ? (
            <CheckCircle
              size={12}
              weight="fill"
              className="shrink-0 text-green-9"
            />
          ) : (
            <Warning size={12} weight="fill" className="shrink-0 text-red-9" />
          )}
          <Text
            size="1"
            weight="medium"
            className="min-w-0 flex-1 truncate font-mono text-[11px]"
            title={automationName}
          >
            {automationName}
          </Text>
          <Flex align="center" gap="1" className="shrink-0">
            <Badge size="1" variant="soft" color={isSuccess ? "green" : "red"}>
              {isSuccess ? "Success" : "Failed"}
            </Badge>
            <span className="rounded bg-gray-3 px-1 py-0.5 font-mono text-[9px] text-gray-10">
              {timeAgo(displayTime)}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(run.id);
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </Flex>
        </Flex>

        {/* Content — click to toggle summary/full */}
        <ScrollArea type="auto" style={{ flex: 1 }}>
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: click to expand */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: click to expand */}
          <div
            className="cursor-pointer p-3 text-[13px] text-gray-12 leading-relaxed"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {isSuccess && run.output ? (
              summarizeMode ? (
                summaryLoading ? (
                  <Text size="2" className="text-gray-10">
                    Generating summary...
                  </Text>
                ) : (
                  <MarkdownRenderer
                    content={llmSummary ?? quickSummary ?? "Completed."}
                  />
                )
              ) : showSummary ? (
                <MarkdownRenderer content={quickSummary ?? "Completed."} />
              ) : (
                <MarkdownRenderer content={run.output} />
              )
            ) : run.error ? (
              <MarkdownRenderer content={run.error} />
            ) : (
              <Text size="2" className="text-gray-10">
                No output available.
              </Text>
            )}
          </div>
        </ScrollArea>
      </Flex>
    </div>
  );
}

function EmptyGridCell() {
  return (
    <div className="flex items-center justify-center bg-gray-1">
      <Text size="1" className="font-mono text-[10px] text-gray-9">
        —
      </Text>
    </div>
  );
}

export function AutomationsSummaryView() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [runs, setRuns] = useState<AutomationRunInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const layout = useCommandCenterStore((s) => s.layout);
  const zoom = useCommandCenterStore((s) => s.zoom);
  const dismissedRunIds = useCommandCenterStore((s) => s.dismissedRunIds);
  const dismissRun = useCommandCenterStore((s) => s.dismissRun);
  const clearDismissed = useCommandCenterStore((s) => s.clearDismissed);

  const { cols, rows } = getGridDimensions(layout);
  const cellCount = cols * rows;

  const fetchData = useCallback(async () => {
    try {
      const [automationList, recentRuns] = await Promise.all([
        trpcClient.automations.list.query(),
        trpcClient.automations.getRecentRuns.query({ limit: 50 }),
      ]);
      setAutomations(automationList);
      setRuns(recentRuns);
    } catch {
      // Data may not be available yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Subscribe to new run completions so they appear in real-time
    const sub = trpcClient.automations.onRunCompleted.subscribe(undefined, {
      onData: () => {
        fetchData();
      },
    });

    // Also poll every 30s as fallback
    const interval = setInterval(fetchData, 30_000);

    return () => {
      sub.unsubscribe();
      clearInterval(interval);
    };
  }, [fetchData]);

  const automationNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of automations) {
      map.set(a.id, a.name);
    }
    return map;
  }, [automations]);

  const visibleRuns = useMemo(
    () =>
      runs.filter(
        (r) => r.status !== "running" && !dismissedRunIds.includes(r.id),
      ),
    [runs, dismissedRunIds],
  );

  const hasDismissed = dismissedRunIds.length > 0;

  const seedIfEmpty = async () => {
    const current = await trpcClient.automations.list.query();
    if (current.length > 0) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const seeds = [
      {
        name: "PR Review Digest",
        prompt: "Check GitHub PRs for this repo.",
        templateId: "pr-review-digest",
        scheduleTime: "09:00",
      },
      {
        name: "Error Spike Alert",
        prompt: "Check error tracking for spikes.",
        templateId: "error-spike-alert",
        scheduleTime: "08:00",
      },
      {
        name: "Slack Channel Digest",
        prompt: "Summarize key Slack messages.",
        templateId: "slack-channel-digest",
        scheduleTime: "09:00",
      },
      {
        name: "Support Queue Triage",
        prompt: "Prioritize open support tickets.",
        templateId: "support-queue-triage",
        scheduleTime: "08:30",
      },
      {
        name: "Weekly Product Metrics",
        prompt: "Compile weekly product metrics.",
        templateId: "weekly-product-metrics",
        scheduleTime: "09:00",
      },
      {
        name: "Funnel Health Check",
        prompt: "Analyze the growth funnel.",
        templateId: "funnel-health-check",
        scheduleTime: "07:00",
      },
    ];

    for (const seed of seeds) {
      await trpcClient.automations.create.mutate({
        name: seed.name,
        prompt: seed.prompt,
        templateId: seed.templateId,
        repoPath: "/Users/demo/code/acme-app",
        scheduleTime: seed.scheduleTime,
        timezone: tz,
      });
    }
  };

  const handleTriggerAll = async () => {
    setTriggering(true);
    setError(null);
    try {
      await seedIfEmpty();
      await trpcClient.automations.triggerAll.mutate();
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <Flex align="center" justify="center" height="100%">
        <Text size="2" className="text-gray-10">
          Loading automations...
        </Text>
      </Flex>
    );
  }

  // Fill grid cells: visible runs first, then empty cells
  const gridCells = Array.from({ length: cellCount }, (_, i) => {
    const run = visibleRuns[i];
    return run ?? null;
  });

  return (
    <Flex direction="column" height="100%">
      {/* Actions bar */}
      <Flex
        align="center"
        gap="2"
        px="3"
        py="1"
        className="shrink-0 border-gray-6 border-b"
      >
        <Text size="1" className="font-mono text-[11px] text-gray-10">
          {visibleRuns.length} run{visibleRuns.length !== 1 ? "s" : ""}
        </Text>
        {error && (
          <Text size="1" color="red" className="font-mono text-[11px]">
            {error}
          </Text>
        )}
        <div className="flex-1" />
        {hasDismissed && (
          <Button
            size="1"
            variant="ghost"
            color="gray"
            onClick={clearDismissed}
          >
            <Trash size={12} />
            Restore
          </Button>
        )}
        <Button
          size="1"
          variant="solid"
          onClick={handleTriggerAll}
          disabled={triggering}
        >
          <Lightning size={12} weight="fill" />
          {triggering ? "Running..." : "Run All"}
        </Button>
      </Flex>

      {/* Grid — same layout as tasks */}
      <div
        className="min-h-0 flex-1 bg-gray-6"
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: "1px",
        }}
      >
        {gridCells.map((run, i) =>
          run ? (
            <AutomationGridCell
              key={run.id}
              run={run}
              automationName={
                automationNameMap.get(run.automationId) ?? "Unknown"
              }
              zoom={zoom}
              onDismiss={dismissRun}
            />
          ) : (
            <EmptyGridCell key={`empty-cell-${String(i)}`} />
          ),
        )}
      </div>
    </Flex>
  );
}
