import { McpServersSettings } from "@features/settings/components/sections/McpServersSettings";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { Plugs } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";

export function McpServersView() {
  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2" className="w-full min-w-0">
        <Plugs size={12} className="shrink-0 text-gray-10" />
        <Text
          className="truncate whitespace-nowrap font-medium text-[13px]"
          title="MCP servers"
        >
          MCP servers
        </Text>
      </Flex>
    ),
    [],
  );

  useSetHeaderContent(headerContent);

  return (
    <Box height="100%" className="overflow-hidden">
      <McpServersSettings />
    </Box>
  );
}
