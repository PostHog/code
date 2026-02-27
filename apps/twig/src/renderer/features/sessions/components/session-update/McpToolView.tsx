import { Plugs } from "@phosphor-icons/react";
import { Box, Flex } from "@radix-ui/themes";
import { useState } from "react";
import {
  ExpandableIcon,
  ExpandedContentBox,
  getContentText,
  StatusIndicators,
  ToolTitle,
  type ToolViewProps,
  useToolCallStatus,
} from "./toolCallUtils";

const INPUT_PREVIEW_MAX_LENGTH = 60;

function parseMcpName(mcpToolName: string): {
  serverName: string;
  toolName: string;
} {
  const parts = mcpToolName.split("__");
  const serverName = parts[1] ?? "";
  return {
    serverName: serverName.toLowerCase() === "posthog" ? "PostHog" : serverName,
    toolName: parts.slice(2).join("__"),
  };
}

function compactInput(rawInput: unknown): string | undefined {
  if (!rawInput || typeof rawInput !== "object") return undefined;
  try {
    const json = JSON.stringify(rawInput);
    if (json === "{}") return undefined;
    if (json.length <= INPUT_PREVIEW_MAX_LENGTH) return json;
    return `${json.slice(0, INPUT_PREVIEW_MAX_LENGTH)}...`;
  } catch {
    return undefined;
  }
}

function formatInput(rawInput: unknown): string | undefined {
  if (!rawInput || typeof rawInput !== "object") return undefined;
  try {
    const json = JSON.stringify(rawInput, null, 2);
    if (json === "{}") return undefined;
    return json;
  } catch {
    return undefined;
  }
}

interface McpToolViewProps extends ToolViewProps {
  mcpToolName: string;
}

export function McpToolView({
  toolCall,
  turnCancelled,
  turnComplete,
  mcpToolName,
  expanded = false,
}: McpToolViewProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const { status, rawInput, content } = toolCall;
  const { isLoading, isFailed, wasCancelled, isComplete } = useToolCallStatus(
    status,
    turnCancelled,
    turnComplete,
  );

  const { serverName, toolName } = parseMcpName(mcpToolName);
  const inputPreview = compactInput(rawInput);
  const fullInput = formatInput(rawInput);

  const output = stripCodeFences(getContentText(content) ?? "");
  const hasOutput = output.trim().length > 0;
  const isExpandable = !!fullInput || hasOutput;

  const handleClick = () => {
    if (isExpandable) {
      setIsExpanded(!isExpanded);
    }
  };

  return (
    <Box
      className={`group py-0.5 ${isExpandable ? "cursor-pointer" : ""}`}
      onClick={handleClick}
    >
      <Flex gap="2">
        <Box className="shrink-0 pt-px">
          <ExpandableIcon
            icon={Plugs}
            isLoading={isLoading}
            isExpandable={isExpandable}
            isExpanded={isExpanded}
          />
        </Box>
        <Flex align="center" gap="1" wrap="wrap" className="min-w-0">
          <ToolTitle>
            <span className="text-gray-10">{serverName}</span>
            {" - "}
            {toolName}
            <span className="text-gray-10">{" (MCP)"}</span>
          </ToolTitle>
          {inputPreview && (
            <ToolTitle>
              <span className="font-mono text-accent-11">{inputPreview}</span>
            </ToolTitle>
          )}
          <StatusIndicators isFailed={isFailed} wasCancelled={wasCancelled} />
        </Flex>
      </Flex>

      {isExpanded && (
        <>
          {fullInput && <ExpandedContentBox>{fullInput}</ExpandedContentBox>}
          {isComplete && hasOutput && (
            <ExpandedContentBox>{output}</ExpandedContentBox>
          )}
        </>
      )}
    </Box>
  );
}

function stripCodeFences(text: string): string {
  return text.replace(/^```\w*\n?/, "").replace(/\n?```\s*$/, "");
}
