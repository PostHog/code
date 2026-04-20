import { McpAppHost } from "@features/mcp-apps/components/McpAppHost";
import { McpToolView } from "@features/mcp-apps/components/McpToolView";
import { parseMcpToolKey } from "@features/mcp-apps/utils/mcp-app-host-utils";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { logger } from "@utils/logger";
import { useEffect } from "react";
import type { ToolViewProps } from "./toolCallUtils";

const log = logger.scope("mcp-tool-block");

interface McpToolBlockProps extends ToolViewProps {
  mcpToolName: string;
}

export function McpToolBlock(props: McpToolBlockProps) {
  const { mcpToolName } = props;
  const { serverName, toolName } = parseMcpToolKey(mcpToolName);

  const mcpAppsDisabled = useSettingsStore((s) => s.mcpAppsDisabledServers);
  const isDisabledForServer = mcpAppsDisabled.includes(serverName);

  const trpcReact = useTRPC();
  const queryClient = useQueryClient();

  const { data: hasUi } = useQuery(
    trpcReact.mcpApps.hasUiForTool.queryOptions(
      { toolKey: mcpToolName },
      {
        staleTime: Infinity,
        enabled: !isDisabledForServer,
      },
    ),
  );

  // TODO: Remove this, used for local debugging only
  useEffect(() => {
    log.debug("McpToolBlock render", {
      mcpToolName,
      hasUi,
      isDisabledForServer,
    });
  }, [mcpToolName, hasUi, isDisabledForServer]);

  // When MCP Apps discovery completes (possibly after this component mounted),
  // invalidate the hasUiForTool query so we pick up newly-discovered UIs.
  useSubscription(
    trpcReact.mcpApps.onDiscoveryComplete.subscriptionOptions(undefined, {
      onData: (_event) => {
        void queryClient.invalidateQueries(
          trpcReact.mcpApps.hasUiForTool.pathFilter(),
        );
        void queryClient.invalidateQueries(
          trpcReact.mcpApps.getUiResource.pathFilter(),
        );
      },
    }),
  );

  return (
    <>
      <McpToolView {...props} />
      {hasUi && !isDisabledForServer && (
        <McpAppHost {...props} serverName={serverName} toolName={toolName} />
      )}
    </>
  );
}
