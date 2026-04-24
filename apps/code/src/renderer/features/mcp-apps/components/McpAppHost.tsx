import type { ToolViewProps } from "@features/sessions/components/session-update/toolCallUtils";
import type { McpUiDisplayMode } from "@modelcontextprotocol/ext-apps/app-bridge";
import type {
  CallToolResult,
  ReadResourceResult,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { ArrowsIn, ArrowsOut, Plugs, X } from "@phosphor-icons/react";
import { Box, Flex, IconButton, Text } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import { useThemeStore } from "@stores/themeStore";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { logger } from "@utils/logger";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type Phase, useAppBridge } from "../hooks/useAppBridge";
import { toCallToolResult } from "../utils/mcp-app-host-utils";

const log = logger.scope("mcp-app-host");

interface McpAppHostProps extends ToolViewProps {
  mcpToolName: string;
  serverName: string;
  toolName: string;
}

export function McpAppHost({
  toolCall,
  mcpToolName,
  serverName,
  toolName,
}: McpAppHostProps) {
  const trpcReact = useTRPC();
  const containerRef = useRef<HTMLDivElement>(null);
  const [_phase, setPhase] = useState<Phase>("loading");
  const [displayMode, setDisplayMode] = useState<McpUiDisplayMode>("inline");
  const [iframeHeight, setIframeHeight] = useState(300);
  const [containerWidth, setContainerWidth] = useState(640);
  const [iframeEl, setIframeEl] = useState<HTMLIFrameElement | null>(null);
  const isDarkMode = useThemeStore((s) => s.isDarkMode);

  const { data: uiResource, isLoading: resourceLoading } = useQuery(
    trpcReact.mcpApps.getUiResource.queryOptions(
      { toolKey: mcpToolName },
      { staleTime: Infinity },
    ),
  );

  const { data: toolDefinition } = useQuery(
    trpcReact.mcpApps.getToolDefinition.queryOptions(
      { toolKey: mcpToolName },
      { staleTime: Infinity },
    ),
  );

  useEffect(() => {
    log.debug("McpAppHost render", {
      mcpToolName,
      resourceLoading,
      hasResource: !!uiResource,
      resourceUri: uiResource?.uri,
    });
  }, [mcpToolName, resourceLoading, uiResource, uiResource?.uri]);

  const proxyToolCallMut = useMutation(
    trpcReact.mcpApps.proxyToolCall.mutationOptions(),
  );
  const proxyResourceReadMut = useMutation(
    trpcReact.mcpApps.proxyResourceRead.mutationOptions(),
  );
  const openLinkMut = useMutation(trpcReact.mcpApps.openLink.mutationOptions());

  const { sendWhenReady } = useAppBridge({
    iframeEl,
    uiResource: uiResource,
    serverName,
    toolName,
    toolDefinition: toolDefinition as Tool | null | undefined,
    toolCall,
    isDarkMode,
    displayMode,
    containerWidth,
    onPhaseChange: setPhase,
    onSizeChange: setIframeHeight,
    onDisplayModeChange: setDisplayMode,
    proxyToolCall: proxyToolCallMut.mutateAsync as (args: {
      serverName: string;
      toolName: string;
      args?: Record<string, unknown>;
    }) => Promise<CallToolResult>,
    proxyResourceRead: proxyResourceReadMut.mutateAsync as (args: {
      serverName: string;
      uri: string;
    }) => Promise<ReadResourceResult>,
    openLink: openLinkMut.mutateAsync,
  });

  // Forward tool results from subscriptions
  useSubscription(
    trpcReact.mcpApps.onToolResult.subscriptionOptions(
      { toolKey: mcpToolName },
      {
        onData: (event) => {
          const toolResult = toCallToolResult(event.result);
          log.info("Sending tool result to app", {
            mcpToolName,
            toolResult,
          });

          sendWhenReady((bridge) => bridge.sendToolResult(toolResult));
        },
      },
    ),
  );

  // Forward tool cancellations from subscriptions
  useSubscription(
    trpcReact.mcpApps.onToolCancelled.subscriptionOptions(
      { toolKey: mcpToolName },
      {
        onData: () => {
          log.info("Received tool cancellation from subscription", {
            mcpToolName,
          });
          sendWhenReady((bridge) => bridge.sendToolCancelled({}));
        },
      },
    ),
  );

  // Track inline container width with ResizeObserver
  useEffect(() => {
    if (displayMode !== "inline") return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.round(entry.contentRect.width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [displayMode]);

  // Handle escape key for fullscreen
  useEffect(() => {
    if (displayMode !== "fullscreen") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDisplayMode("inline");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [displayMode]);

  if (resourceLoading || !uiResource) {
    return null;
  }

  const iframeElement = (
    <iframe
      ref={setIframeEl}
      src="mcp-sandbox://proxy"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-presentation"
      style={{
        height: displayMode === "fullscreen" ? "100%" : `${iframeHeight}px`,
      }}
      title={`MCP App: ${serverName} - ${toolName}`}
      className="w-full rounded-(--radius-2) border-0"
    />
  );

  const fullscreenToggle = (
    <Flex justify="end" className="py-0.5">
      <IconButton
        size="1"
        variant="ghost"
        color="gray"
        onClick={(e) => {
          e.stopPropagation();
          const newMode = displayMode === "inline" ? "fullscreen" : "inline";
          setDisplayMode(newMode);
        }}
        title={
          displayMode === "inline" ? "Expand to fullscreen" : "Exit fullscreen"
        }
      >
        {displayMode === "inline" ? (
          <ArrowsOut size={12} />
        ) : (
          <ArrowsIn size={12} />
        )}
      </IconButton>
    </Flex>
  );

  if (displayMode === "fullscreen") {
    const portalTarget = document.getElementById("fullscreen-portal");
    if (portalTarget) {
      return (
        <>
          {fullscreenToggle}

          {createPortal(
            <Box
              className="pointer-events-auto absolute inset-0 flex flex-col bg-gray-1"
              style={{
                transition: "opacity 150ms ease",
              }}
            >
              <Flex
                align="center"
                justify="between"
                className="border-gray-6 border-b px-4 py-2"
              >
                <Flex align="center" gap="2">
                  <Plugs size={14} className="text-gray-11" />
                  <Text className="text-gray-11 text-sm">
                    {serverName} - {toolName}
                  </Text>
                </Flex>
                <IconButton
                  size="1"
                  variant="ghost"
                  color="gray"
                  onClick={() => {
                    setDisplayMode("inline");
                  }}
                  title="Exit fullscreen (Escape)"
                >
                  <X size={14} />
                </IconButton>
              </Flex>

              <Box className="flex-1 overflow-hidden p-4">{iframeElement}</Box>
            </Box>,
            portalTarget,
          )}
        </>
      );
    }
  }

  return (
    <Box>
      {fullscreenToggle}
      <Box
        ref={containerRef}
        className="overflow-hidden rounded-lg border border-gray-6"
      >
        {iframeElement}
      </Box>
    </Box>
  );
}
