import { Combobox } from "@components/ui/combobox/Combobox";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { HardDrives, Plus } from "@phosphor-icons/react";
import { Flex, Tooltip } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc/client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface EnvironmentSelectorProps {
  repoPath: string | null;
  value: string | null;
  onChange: (environmentId: string | null) => void;
  disabled?: boolean;
  variant?: "outline" | "ghost";
}

export function EnvironmentSelector({
  repoPath,
  value,
  onChange,
  disabled = false,
  variant = "outline",
}: EnvironmentSelectorProps) {
  const [open, setOpen] = useState(false);
  const trpc = useTRPC();

  const { data: environments = [] } = useQuery({
    ...trpc.environment.list.queryOptions({ repoPath: repoPath ?? "" }),
    enabled: !!repoPath,
  });

  const selectedEnvironment = environments.find((env) => env.id === value);
  const displayText = selectedEnvironment?.name ?? "No environment";

  const handleChange = (newValue: string) => {
    onChange(newValue || null);
    setOpen(false);
  };

  const handleOpenSettings = () => {
    setOpen(false);
    useSettingsDialogStore
      .getState()
      .open("environments", { repoPath: repoPath ?? undefined });
  };

  const triggerContent = (
    <Flex align="center" gap="1" style={{ minWidth: 0 }}>
      <HardDrives size={16} weight="regular" style={{ flexShrink: 0 }} />
      <span className="combobox-trigger-text">{displayText}</span>
    </Flex>
  );

  return (
    <Tooltip content={displayText} delayDuration={300}>
      <Combobox.Root
        value={value ?? ""}
        onValueChange={handleChange}
        open={open}
        onOpenChange={setOpen}
        size="1"
        disabled={disabled || !repoPath}
      >
        <Combobox.Trigger variant={variant} placeholder="No environment">
          {triggerContent}
        </Combobox.Trigger>

        <Combobox.Content>
          <Combobox.Input placeholder="Search environments" />
          <Combobox.Empty>No environments found.</Combobox.Empty>

          <Combobox.Group heading="Environments">
            {environments.map((env) => (
              <Combobox.Item
                key={env.id}
                value={env.id}
                icon={<HardDrives size={11} weight="regular" />}
              >
                {env.name}
              </Combobox.Item>
            ))}
          </Combobox.Group>

          <Combobox.Footer>
            <button
              type="button"
              className="combobox-footer-button"
              onClick={handleOpenSettings}
            >
              <Flex
                align="center"
                gap="2"
                style={{ color: "var(--accent-11)" }}
              >
                <Plus size={11} weight="bold" />
                <span>Create local environment</span>
              </Flex>
            </button>
          </Combobox.Footer>
        </Combobox.Content>
      </Combobox.Root>
    </Tooltip>
  );
}
