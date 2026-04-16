import { useSandboxEnvironments } from "@features/settings/hooks/useSandboxEnvironments";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import type { WorkspaceMode } from "@main/services/workspace/schemas";
import {
  ArrowsSplit,
  CaretDown,
  Cloud,
  Laptop,
  Plus,
} from "@phosphor-icons/react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  MenuLabel,
} from "@posthog/quill";
import { useCallback, useMemo, useState } from "react";

export type { WorkspaceMode };

interface WorkspaceModeSelectProps {
  value: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
  size?: "1" | "2";
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
      <ArrowsSplit size={14} weight="regular" className="rotate-[270deg]" />
    ),
  },
  {
    mode: "local",
    label: "Local",
    description: "Edits your repo directly on current branch",
    icon: <Laptop size={14} weight="regular" />,
  },
];

const CLOUD_ICON = <Cloud size={14} weight="regular" />;

export function WorkspaceModeSelect({
  value,
  onChange,
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
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label="Workspace mode"
          >
            <span className="text-muted-foreground">{triggerIcon}</span>
            {triggerLabel}
            <CaretDown
              size={10}
              weight="bold"
              className="text-muted-foreground"
            />
          </Button>
        }
      />
      <DropdownMenuContent align="start" side="bottom" sideOffset={6}>
        {localModes.map((item) => (
          <DropdownMenuItem
            key={item.mode}
            onClick={() => {
              onChange(item.mode);
              onCloudEnvironmentChange?.(null);
            }}
          >
            <span className="mt-0.5 mr-2 text-muted-foreground">
              {item.icon}
            </span>
            <span className="flex flex-col">
              <span>{item.label}</span>
              <span className="text-muted-foreground text-xs">
                {item.description}
              </span>
            </span>
          </DropdownMenuItem>
        ))}

        {showCloud && (
          <>
            <DropdownMenuSeparator />
            <div className="flex items-center justify-between px-2 py-1">
              <MenuLabel className="p-0">Cloud environments</MenuLabel>
              <button
                type="button"
                onClick={handleAddEnvironment}
                aria-label="Add cloud environment"
                className="flex cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0.5 text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
              >
                <Plus size={12} />
              </button>
            </div>

            <DropdownMenuItem
              onClick={() => {
                onChange("cloud");
                onCloudEnvironmentChange?.(null);
              }}
            >
              <span className="mt-0.5 mr-2 text-muted-foreground">
                {CLOUD_ICON}
              </span>
              <span className="flex flex-col">
                <span>Default</span>
                <span className="text-muted-foreground text-xs">
                  Full network access
                </span>
              </span>
            </DropdownMenuItem>

            {environments.map((env) => (
              <DropdownMenuItem
                key={`cloud-env-${env.id}`}
                onClick={() => {
                  onChange("cloud");
                  onCloudEnvironmentChange?.(env.id);
                }}
              >
                <span className="mt-0.5 mr-2 text-muted-foreground">
                  {CLOUD_ICON}
                </span>
                <span className="flex flex-col">
                  <span>{env.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {env.network_access_level === "full"
                      ? "Full network access"
                      : env.network_access_level === "trusted"
                        ? "Trusted sources only"
                        : `${env.allowed_domains.length} allowed domain${env.allowed_domains.length !== 1 ? "s" : ""}`}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
