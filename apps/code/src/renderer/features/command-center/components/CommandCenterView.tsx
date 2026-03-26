import { useTaskViewed } from "@features/sidebar/hooks/useTaskViewed";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { SquaresFour } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { trpcClient } from "@renderer/trpc/client";
import type { Automation, AutomationRunInfo } from "@shared/types/automations";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCommandCenterData } from "../hooks/useCommandCenterData";
import { useCommandCenterStore } from "../stores/commandCenterStore";
import { AutomationsSummaryView } from "./AutomationsSummaryView";
import { CommandCenterGrid } from "./CommandCenterGrid";
import { CommandCenterToolbar } from "./CommandCenterToolbar";

export function CommandCenterView() {
  const layout = useCommandCenterStore((s) => s.layout);
  const viewMode = useCommandCenterStore((s) => s.viewMode);
  const autoPopulateAutomationRun = useCommandCenterStore(
    (s) => s.autoPopulateAutomationRun,
  );

  // Fetch automation data for the grid
  const [automationRuns, setAutomationRuns] = useState<AutomationRunInfo[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);

  const fetchAutomationData = useCallback(async () => {
    try {
      const [runs, autos] = await Promise.all([
        trpcClient.automations.getRecentRuns.query({ limit: 50 }),
        trpcClient.automations.list.query(),
      ]);
      setAutomationRuns(runs);
      setAutomations(autos);
    } catch {
      // Automation data may not be available
    }
  }, []);

  useEffect(() => {
    fetchAutomationData();

    // Subscribe to new runs — auto-populate into grid
    const startSub = trpcClient.automations.onRunStarted.subscribe(undefined, {
      onData: (run) => {
        autoPopulateAutomationRun(run.id);
        fetchAutomationData();
      },
    });

    const completeSub = trpcClient.automations.onRunCompleted.subscribe(
      undefined,
      {
        onData: (run) => {
          // Also auto-populate on complete in case the start event was missed
          autoPopulateAutomationRun(run.id);
          fetchAutomationData();
        },
      },
    );

    return () => {
      startSub.unsubscribe();
      completeSub.unsubscribe();
    };
  }, [fetchAutomationData, autoPopulateAutomationRun]);

  const { cells, summary } = useCommandCenterData(
    automationRuns,
    automations,
  );
  const { markAsViewed } = useTaskViewed();

  const visibleTaskIds = useMemo(
    () => cells.map((c) => c.taskId).filter((id): id is string => id != null),
    [cells],
  );

  useEffect(() => {
    for (const taskId of visibleTaskIds) {
      markAsViewed(taskId);
    }
  }, [visibleTaskIds, markAsViewed]);

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2" className="w-full min-w-0">
        <SquaresFour size={12} className="shrink-0 text-gray-10" />
        <Text
          size="1"
          weight="medium"
          className="truncate whitespace-nowrap font-mono text-[12px]"
          title="Command Center"
        >
          Command Center
        </Text>
      </Flex>
    ),
    [],
  );

  useSetHeaderContent(headerContent);

  return (
    <Flex direction="column" height="100%">
      <CommandCenterToolbar summary={summary} cells={cells} />
      <Box className="min-h-0 flex-1">
        {viewMode === "automations" ? (
          <AutomationsSummaryView />
        ) : (
          <CommandCenterGrid layout={layout} cells={cells} />
        )}
      </Box>
    </Flex>
  );
}
