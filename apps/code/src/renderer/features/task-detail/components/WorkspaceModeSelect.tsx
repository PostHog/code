import { useSandboxEnvironments } from "@features/settings/hooks/useSandboxEnvironments";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import type { WorkspaceMode } from "@main/services/workspace/schemas";
import { ArrowsSplit, Cloud, Laptop, Plus } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";
import { useCallback, useMemo, useState } from "react";

export type { WorkspaceMode };

interface WorkspaceModeSelectProps {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  size?: Responsive<"1" | "2">;
  disabled?: boolean;
  /** Override the available modes instead of deriving from feature flags */
  overrideModes?: WorkspaceMode[];
  /** Currently selected cloud environment ID (only relevant when mode is "cloud") */
  selectedCloudEnvironmentId?: string | null;
  /** Called when a specific cloud environment is selected */
  onCloudEnvironmentChange?: (envId: string | null) => void;
}

const LOCAL_MODES: {
  mode: WorkspaceMode;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    mode: "worktree",
    label: "Worktree",
    description: "Create a copy of your local project to work in parallel",
    icon: (
      <ArrowsSplit
        size={16}
        weight="regular"
        style={{ transform: "rotate(270deg)" }}
      />
    ),
  },
  {
    mode: "local",
    label: "Local",
    description: "Edits your repo directly on current branch",
    icon: <Laptop size={16} weight="regular" />,
  },
];

const CLOUD_ICON = <Cloud size={16} weight="regular" />;

export function WorkspaceModeSelect({
  value,
  onChange,
  size = "1",
  disabled,
  overrideModes,
  selectedCloudEnvironmentId,
  onCloudEnvironmentChange,
}: WorkspaceModeSelectProps) {
  const cloudModeEnabled =
    useFeatureFlag("twig-cloud-mode-toggle") || import.meta.env.DEV;

  const { environments } = useSandboxEnvironments();
  const openSettings = useSettingsDialogStore((s) => s.open);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleAddEnvironment = useCallback(() => {
    setMenuOpen(false);
    openSettings("cloud-environments", "create");
  }, [openSettings]);

  const showCloud = overrideModes
    ? overrideModes.includes("cloud")
    : cloudModeEnabled;

  const localModes = useMemo(
    () =>
      LOCAL_MODES.filter(
        (m) => !overrideModes || overrideModes.includes(m.mode),
      ),
    [overrideModes],
  );

  const selectedEnvName = useMemo(() => {
    if (value !== "cloud" || !selectedCloudEnvironmentId) return null;
    return environments.find((e) => e.id === selectedCloudEnvironmentId)?.name;
  }, [value, selectedCloudEnvironmentId, environments]);

  const triggerLabel = useMemo(() => {
    if (value === "cloud") {
      return selectedEnvName ? `Cloud · ${selectedEnvName}` : "Cloud";
    }
    return LOCAL_MODES.find((m) => m.mode === value)?.label ?? "Worktree";
  }, [value, selectedEnvName]);

  const triggerIcon = useMemo(() => {
    if (value === "cloud") return CLOUD_ICON;
    return (
      LOCAL_MODES.find((m) => m.mode === value)?.icon ?? LOCAL_MODES[0].icon
    );
  }, [value]);

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenu.Trigger disabled={disabled}>
        <Button color="gray" variant="outline" size={size} disabled={disabled}>
          <Flex justify="between" align="center" gap="2">
            <Flex align="center" gap="2" style={{ minWidth: 0 }}>
              {triggerIcon}
              <Text size={size}>{triggerLabel}</Text>
            </Flex>
            <ChevronDownIcon style={{ flexShrink: 0 }} />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" size="1">
        {localModes.map((item) => (
          <DropdownMenu.Item
            key={item.mode}
            onSelect={() => {
              onChange(item.mode);
              onCloudEnvironmentChange?.(null);
            }}
            style={{ padding: "6px 8px", height: "auto" }}
          >
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span
                style={{
                  marginTop: 2,
                  flexShrink: 0,
                  color: "var(--gray-11)",
                }}
              >
                {item.icon}
              </span>
              <div>
                <Text size="1">{item.label}</Text>
                <Text size="1" color="gray" style={{ display: "block" }}>
                  {item.description}
                </Text>
              </div>
            </div>
          </DropdownMenu.Item>
        ))}

        {showCloud && (
          <>
            <DropdownMenu.Separator />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "4px 8px",
              }}
            >
              <Text size="1" color="gray" weight="medium">
                Cloud environments
              </Text>
              <button
                type="button"
                onClick={handleAddEnvironment}
                className="flex cursor-pointer items-center justify-center rounded-1 border-0 bg-transparent p-0.5 text-gray-10 transition-colors hover:bg-gray-4 hover:text-gray-12"
              >
                <Plus size={12} />
              </button>
            </div>

            <DropdownMenu.Item
              onSelect={() => {
                onChange("cloud");
                onCloudEnvironmentChange?.(null);
              }}
              style={{ padding: "6px 8px", height: "auto" }}
            >
              <div
                style={{ display: "flex", gap: 6, alignItems: "flex-start" }}
              >
                <span
                  style={{
                    marginTop: 2,
                    flexShrink: 0,
                    color: "var(--gray-11)",
                  }}
                >
                  {CLOUD_ICON}
                </span>
                <div>
                  <Text size="1">Default</Text>
                  <Text size="1" color="gray" style={{ display: "block" }}>
                    Full network access
                  </Text>
                </div>
              </div>
            </DropdownMenu.Item>

            {environments.map((env) => (
              <DropdownMenu.Item
                key={`cloud-env-${env.id}`}
                onSelect={() => {
                  onChange("cloud");
                  onCloudEnvironmentChange?.(env.id);
                }}
                style={{ padding: "6px 8px", height: "auto" }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      marginTop: 2,
                      flexShrink: 0,
                      color: "var(--gray-11)",
                    }}
                  >
                    {CLOUD_ICON}
                  </span>
                  <div>
                    <Text size="1">{env.name}</Text>
                    <Text size="1" color="gray" style={{ display: "block" }}>
                      {env.network_access_level === "full"
                        ? "Full network access"
                        : env.network_access_level === "trusted"
                          ? "Trusted sources only"
                          : `${env.allowed_domains.length} allowed domain${env.allowed_domains.length !== 1 ? "s" : ""}`}
                    </Text>
                  </div>
                </div>
              </DropdownMenu.Item>
            ))}
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
