import { useTaskViewed } from "@features/sidebar/hooks/useTaskViewed";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Lightning } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useEffect, useMemo } from "react";
import { useCommandCenterData } from "../hooks/useCommandCenterData";
import { useCommandCenterStore } from "../stores/commandCenterStore";
import { CommandCenterGrid } from "./CommandCenterGrid";
import { CommandCenterToolbar } from "./CommandCenterToolbar";

export function CommandCenterView() {
  const layout = useCommandCenterStore((s) => s.layout);
  const { cells, summary } = useCommandCenterData();
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
        <Lightning size={12} className="shrink-0 text-gray-10" />
        <Text
          size="1"
          weight="medium"
          className="truncate whitespace-nowrap text-[13px]"
          title="ADHD Mode"
        >
          ADHD Mode
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
        <CommandCenterGrid layout={layout} cells={cells} />
      </Box>
    </Flex>
  );
}
