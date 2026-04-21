import { Badge, Flex, Text } from "@radix-ui/themes";
import type {
  McpRecommendedServer,
  McpServerInstallation,
} from "@renderer/api/posthogClient";
import { ServerIcon } from "./icons";
import {
  getInstallationStatus,
  STATUS_COLORS,
  STATUS_LABELS,
} from "./statusBadge";

interface InstalledStripProps {
  installations: McpServerInstallation[];
  templates: McpRecommendedServer[];
  onSelect: (installationId: string) => void;
}

export function InstalledStrip({
  installations,
  templates,
  onSelect,
}: InstalledStripProps) {
  if (installations.length === 0) return null;

  return (
    <Flex direction="column" gap="2">
      <Flex align="center" justify="between">
        <Text size="2" weight="medium">
          Installed
        </Text>
        <Text size="1" color="gray">
          {installations.length}{" "}
          {installations.length === 1 ? "server" : "servers"}
        </Text>
      </Flex>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {installations.map((installation) => {
          const template =
            templates.find((t) => t.id === installation.template_id) ?? null;
          const name =
            installation.display_name ||
            installation.name ||
            template?.name ||
            installation.url ||
            "Unnamed";
          const status = getInstallationStatus(installation);
          return (
            <button
              key={installation.id}
              type="button"
              onClick={() => onSelect(installation.id)}
              className="flex items-center gap-2 rounded border border-gray-5 bg-gray-2 p-2 text-left transition-colors hover:border-gray-7 hover:bg-gray-3"
            >
              <ServerIcon iconKey={template?.icon_key} name={name} size={28} />
              <Flex direction="column" gap="0" style={{ minWidth: 0, flex: 1 }}>
                <Text size="2" weight="medium" truncate>
                  {name}
                </Text>
                <Text size="1" color="gray">
                  {installation.tool_count ?? 0} tools
                </Text>
              </Flex>
              {status !== "connected" && (
                <Badge color={STATUS_COLORS[status]} variant="soft" size="1">
                  {STATUS_LABELS[status]}
                </Badge>
              )}
            </button>
          );
        })}
      </div>
    </Flex>
  );
}
