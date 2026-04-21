import { useMcpInstallationTools } from "@features/settings/hooks/useMcpInstallationTools";
import {
  ArrowClockwise,
  ArrowLeft,
  ArrowUpRight,
  Check,
  DownloadSimple,
  Prohibit,
  Shield,
  Trash,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Flex,
  IconButton,
  Separator,
  Spinner,
  Switch,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import type {
  McpApprovalState,
  McpRecommendedServer,
  McpServerInstallation,
} from "@renderer/api/posthogClient";
import { useMemo, useState } from "react";
import { ServerIcon } from "./icons";
import {
  getInstallationStatus,
  STATUS_COLORS,
  STATUS_LABELS,
} from "./statusBadge";
import { ToolRow } from "./ToolRow";

interface ServerDetailViewProps {
  installation: McpServerInstallation | null;
  template: McpRecommendedServer | null;
  isEnabled: boolean;
  isInstalling: boolean;
  isReauthorizing: boolean;
  onBack: () => void;
  onConnect: () => void;
  onReauthorize: () => void;
  onToggleEnabled: (enabled: boolean) => void;
  onUninstall: () => void;
}

export function ServerDetailView({
  installation,
  template,
  isEnabled,
  isInstalling,
  isReauthorizing,
  onBack,
  onConnect,
  onReauthorize,
  onToggleEnabled,
  onUninstall,
}: ServerDetailViewProps) {
  const [showRemoved, setShowRemoved] = useState(false);

  const name =
    installation?.display_name ||
    installation?.name ||
    template?.name ||
    installation?.url ||
    "Server";
  const description = installation?.description || template?.description || "";
  const docsUrl = template?.docs_url || null;
  const iconKey = template?.icon_key || name;
  const authType = installation?.auth_type || template?.auth_type;

  const {
    tools,
    isLoading,
    setToolApproval,
    setBulkApproval,
    bulkPending,
    refresh,
    refreshPending,
  } = useMcpInstallationTools(installation?.id ?? null, {
    includeRemoved: showRemoved,
  });

  const status = installation ? getInstallationStatus(installation) : null;
  const statusLabel = status ? STATUS_LABELS[status] : "Not installed";
  const statusColor = status ? STATUS_COLORS[status] : "gray";

  const counts = useMemo(() => {
    return tools.reduce(
      (acc, t) => {
        if (t.removed_at) return acc;
        acc[t.approval_state] = (acc[t.approval_state] ?? 0) + 1;
        return acc;
      },
      {} as Record<McpApprovalState, number>,
    );
  }, [tools]);

  const visibleTools = useMemo(() => {
    return [...tools].sort((a, b) => {
      if (!!a.removed_at !== !!b.removed_at) {
        return a.removed_at ? 1 : -1;
      }
      return a.tool_name.localeCompare(b.tool_name);
    });
  }, [tools]);

  const removedCount = tools.filter((t) => !!t.removed_at).length;

  return (
    <Flex direction="column" gap="4" style={{ minWidth: 0 }}>
      <Flex align="center" gap="2">
        <Button variant="ghost" color="gray" size="1" onClick={onBack}>
          <ArrowLeft size={12} />
          Back
        </Button>
      </Flex>

      <Flex align="start" gap="3">
        <ServerIcon iconKey={iconKey} name={name} size={56} />
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap="2">
            <Text size="5" weight="bold" truncate>
              {name}
            </Text>
            {installation && (
              <Badge color={statusColor} variant="soft">
                {statusLabel}
              </Badge>
            )}
          </Flex>
          {description && (
            <Text size="2" color="gray">
              {description}
            </Text>
          )}
          <Flex gap="3" align="center" mt="1">
            {authType && (
              <Badge color="gray" variant="outline" size="1">
                {authType === "oauth" ? "OAuth" : "API key"}
              </Badge>
            )}
            {docsUrl && (
              <a
                href={docsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-accent-11 text-xs hover:underline"
              >
                <ArrowUpRight size={11} />
                Docs
              </a>
            )}
          </Flex>
        </Flex>
        <Flex direction="column" align="end" gap="2" className="shrink-0">
          <Flex gap="2" align="center">
            {installation ? (
              status === "needs_reauth" || status === "pending_oauth" ? (
                <Button
                  variant="solid"
                  size="2"
                  onClick={onReauthorize}
                  disabled={isReauthorizing}
                >
                  {isReauthorizing ? <Spinner size="1" /> : null}
                  Reconnect
                </Button>
              ) : null
            ) : (
              <Button
                variant="solid"
                size="2"
                onClick={onConnect}
                disabled={isInstalling}
              >
                {isInstalling ? (
                  <Spinner size="1" />
                ) : (
                  <DownloadSimple size={12} />
                )}
                Connect
              </Button>
            )}
            {installation && (
              <Tooltip content="Remove server">
                <IconButton
                  variant="ghost"
                  color="red"
                  size="2"
                  onClick={onUninstall}
                >
                  <Trash size={14} />
                </IconButton>
              </Tooltip>
            )}
          </Flex>
          {installation && status === "connected" && (
            <Flex align="center" gap="2">
              <Text size="1" color="gray">
                {isEnabled ? "Enabled" : "Disabled"}
              </Text>
              <Switch
                size="1"
                checked={isEnabled}
                onCheckedChange={onToggleEnabled}
              />
            </Flex>
          )}
        </Flex>
      </Flex>

      {installation && status === "connected" && (
        <>
          <Separator size="4" />
          <Flex align="center" justify="between" wrap="wrap" gap="2">
            <Flex align="center" gap="3">
              <Text size="3" weight="medium">
                Tools
              </Text>
              <Badge color="gray" variant="soft" size="1">
                {tools.filter((t) => !t.removed_at).length}
              </Badge>
              <Flex gap="2">
                {counts.approved ? (
                  <Badge color="green" variant="soft" size="1">
                    {counts.approved} approved
                  </Badge>
                ) : null}
                {counts.needs_approval ? (
                  <Badge color="amber" variant="soft" size="1">
                    {counts.needs_approval} need approval
                  </Badge>
                ) : null}
                {counts.do_not_use ? (
                  <Badge color="red" variant="soft" size="1">
                    {counts.do_not_use} blocked
                  </Badge>
                ) : null}
              </Flex>
            </Flex>
            <Flex gap="2" align="center">
              <Text size="1" color="gray">
                Set all:
              </Text>
              <Tooltip content="Approve all">
                <IconButton
                  variant="soft"
                  color="green"
                  size="1"
                  disabled={bulkPending || tools.length === 0}
                  onClick={() => setBulkApproval("approved")}
                >
                  <Check size={12} weight="bold" />
                </IconButton>
              </Tooltip>
              <Tooltip content="Require approval for all">
                <IconButton
                  variant="soft"
                  color="amber"
                  size="1"
                  disabled={bulkPending || tools.length === 0}
                  onClick={() => setBulkApproval("needs_approval")}
                >
                  <Shield size={12} weight="bold" />
                </IconButton>
              </Tooltip>
              <Tooltip content="Block all">
                <IconButton
                  variant="soft"
                  color="red"
                  size="1"
                  disabled={bulkPending || tools.length === 0}
                  onClick={() => setBulkApproval("do_not_use")}
                >
                  <Prohibit size={12} weight="bold" />
                </IconButton>
              </Tooltip>
              <Separator orientation="vertical" />
              <Tooltip content="Refresh tools from server">
                <IconButton
                  variant="soft"
                  color="gray"
                  size="1"
                  disabled={refreshPending}
                  onClick={refresh}
                >
                  {refreshPending ? (
                    <Spinner size="1" />
                  ) : (
                    <ArrowClockwise size={12} weight="bold" />
                  )}
                </IconButton>
              </Tooltip>
            </Flex>
          </Flex>

          {isLoading ? (
            <Flex align="center" justify="center" py="6">
              <Spinner size="2" />
            </Flex>
          ) : visibleTools.length === 0 ? (
            <Flex
              align="center"
              justify="center"
              direction="column"
              gap="1"
              py="6"
              className="rounded border border-gray-6 border-dashed"
            >
              <Text size="2" weight="medium">
                No tools discovered yet.
              </Text>
              <Text size="1" color="gray">
                Try refreshing, or check that the server is online.
              </Text>
            </Flex>
          ) : (
            <Flex direction="column" gap="2">
              {visibleTools.map((tool) => (
                <ToolRow
                  key={tool.tool_name}
                  tool={tool}
                  onChange={(approval_state) =>
                    setToolApproval({
                      toolName: tool.tool_name,
                      approval_state,
                    })
                  }
                />
              ))}
            </Flex>
          )}

          {removedCount > 0 && (
            <Flex justify="end">
              <Button
                variant="ghost"
                color="gray"
                size="1"
                onClick={() => setShowRemoved((v) => !v)}
              >
                {showRemoved ? "Hide" : "Show"} removed tools ({removedCount})
              </Button>
            </Flex>
          )}
        </>
      )}

      {installation && status !== "connected" && (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="2"
          py="6"
          className="rounded border border-gray-6 border-dashed"
        >
          <Text size="2" weight="medium">
            {status === "pending_oauth"
              ? "Finish connecting to start using this server."
              : "This server needs to be reconnected."}
          </Text>
          <Text size="1" color="gray">
            Click Reconnect above to resume the OAuth flow.
          </Text>
        </Flex>
      )}
    </Flex>
  );
}
