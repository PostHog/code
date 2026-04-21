import { filterInstallationsByQuery } from "@features/settings/hooks/mcpFilters";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import {
  Flex,
  IconButton,
  ScrollArea,
  Text,
  TextField,
} from "@radix-ui/themes";
import type {
  McpRecommendedServer,
  McpServerInstallation,
} from "@renderer/api/posthogClient";
import { useMemo, useState } from "react";
import { ServerIcon } from "./icons";
import { getInstallationStatus, type InstallationStatus } from "./statusBadge";

const PULSE_COLOR: Record<InstallationStatus, string> = {
  connected: "var(--green-9)",
  pending_oauth: "var(--amber-9)",
  needs_reauth: "var(--red-9)",
};

interface McpInstalledRailProps {
  installations: McpServerInstallation[];
  templates: McpRecommendedServer[];
  selectedInstallationId: string | null;
  onAddCustom: () => void;
  onSelectInstallation: (installationId: string) => void;
}

export function McpInstalledRail({
  installations,
  templates,
  selectedInstallationId,
  onAddCustom,
  onSelectInstallation,
}: McpInstalledRailProps) {
  const [search, setSearch] = useState("");

  const templatesById = useMemo(() => {
    const map = new Map<string, McpRecommendedServer>();
    for (const template of templates) map.set(template.id, template);
    return map;
  }, [templates]);

  const resolveName = (installation: McpServerInstallation) => {
    const template = installation.template_id
      ? templatesById.get(installation.template_id)
      : null;
    return (
      installation.display_name ||
      installation.name ||
      template?.name ||
      installation.url ||
      "Server"
    );
  };

  const visibleInstallations = useMemo(() => {
    const filtered = filterInstallationsByQuery(
      installations,
      templatesById,
      search,
    );
    return [...filtered].sort((a, b) =>
      resolveName(a).localeCompare(resolveName(b), undefined, {
        sensitivity: "base",
      }),
    );
    // biome-ignore lint/correctness/useExhaustiveDependencies: resolveName closes over templatesById already in deps
  }, [installations, templatesById, search, resolveName]);

  return (
    <aside
      className="flex h-full w-[256px] shrink-0 flex-col border-gray-6 border-r bg-gray-2"
      style={{ minHeight: 0 }}
    >
      <Flex
        align="center"
        justify="between"
        px="3"
        pt="3"
        pb="2"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Text size="2" weight="bold">
          MCP servers
        </Text>
        <IconButton
          variant="ghost"
          color="gray"
          size="1"
          onClick={onAddCustom}
          title="Add custom server"
        >
          <Plus size={14} />
        </IconButton>
      </Flex>

      <Flex direction="column" gap="2" px="3" pt="3">
        <TextField.Root
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search installed…"
          size="1"
        >
          <TextField.Slot>
            <MagnifyingGlass size={12} />
          </TextField.Slot>
          {search && (
            <TextField.Slot>
              <IconButton
                variant="ghost"
                size="1"
                onClick={() => setSearch("")}
              >
                <X size={10} />
              </IconButton>
            </TextField.Slot>
          )}
        </TextField.Root>
      </Flex>

      <Flex
        align="center"
        justify="between"
        px="3"
        pt="4"
        pb="1"
        style={{ letterSpacing: "0.06em" }}
      >
        <Text
          size="1"
          weight="medium"
          color="gray"
          style={{ textTransform: "uppercase", fontSize: 10 }}
        >
          Active
        </Text>
        <Text
          size="1"
          color="gray"
          style={{
            background: "var(--gray-4)",
            padding: "1px 6px",
            borderRadius: 10,
            fontSize: 10,
          }}
        >
          {visibleInstallations.length}
        </Text>
      </Flex>

      <ScrollArea style={{ flex: 1, minHeight: 0 }}>
        <Flex direction="column" gap="1" px="2" pb="3">
          {visibleInstallations.length === 0 ? (
            <Text
              size="1"
              color="gray"
              style={{ padding: "8px 10px", fontStyle: "italic" }}
            >
              {search
                ? `Nothing matches "${search}".`
                : "No servers installed yet."}
            </Text>
          ) : (
            visibleInstallations.map((installation) => {
              const template = installation.template_id
                ? (templatesById.get(installation.template_id) ?? null)
                : null;
              const name =
                installation.display_name ||
                installation.name ||
                template?.name ||
                installation.url ||
                "Server";
              const status = getInstallationStatus(installation);
              const active = selectedInstallationId === installation.id;
              return (
                <button
                  key={installation.id}
                  type="button"
                  onClick={() => onSelectInstallation(installation.id)}
                  className={`grid items-center gap-2 rounded px-2 py-1.5 text-left transition-colors ${
                    active
                      ? "bg-gray-1 text-gray-12 shadow-sm"
                      : "text-gray-11 hover:bg-gray-3"
                  }`}
                  style={{ gridTemplateColumns: "28px 1fr auto" }}
                >
                  <ServerIcon
                    iconKey={template?.icon_key}
                    name={name}
                    size={28}
                  />
                  <Flex
                    direction="column"
                    style={{ minWidth: 0, lineHeight: 1.2 }}
                  >
                    <Text size="1" weight="medium" truncate>
                      {name}
                    </Text>
                    <Text
                      size="1"
                      color="gray"
                      truncate
                      style={{ fontSize: 10 }}
                    >
                      {installation.tool_count ?? 0} tools
                    </Text>
                  </Flex>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: PULSE_COLOR[status],
                      boxShadow: `0 0 0 3px color-mix(in oklch, ${PULSE_COLOR[status]} 20%, transparent)`,
                    }}
                  />
                </button>
              );
            })
          )}
        </Flex>
      </ScrollArea>
    </aside>
  );
}
