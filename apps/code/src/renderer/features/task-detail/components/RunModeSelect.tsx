import { Cloud, Desktop } from "@phosphor-icons/react";
import { ChevronDownIcon } from "@radix-ui/react-icons";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import type { Responsive } from "@radix-ui/themes/dist/esm/props/prop-def.js";

export type RunMode = "local" | "cloud";

interface RunModeSelectProps {
  value: RunMode;
  onChange: (mode: RunMode) => void;
  size?: Responsive<"1" | "2">;
}

const MODE_CONFIG: Record<RunMode, { label: string; icon: React.ReactNode }> = {
  local: {
    label: "Local",
    icon: <Desktop size={16} weight="regular" />,
  },
  cloud: {
    label: "Cloud",
    icon: <Cloud size={16} weight="regular" />,
  },
};

export function RunModeSelect({
  value,
  onChange,
  size = "1",
}: RunModeSelectProps) {
  const textSizeClass = size === "1" ? "text-[13px]" : "text-sm";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <Button color="gray" variant="outline" size={size}>
          <Flex justify="between" align="center" gap="2">
            <Flex align="center" gap="2" className="min-w-0">
              {MODE_CONFIG[value].icon}
              <Text className={textSizeClass}>{MODE_CONFIG[value].label}</Text>
            </Flex>
            <ChevronDownIcon className="shrink-0" />
          </Flex>
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content
        align="start"
        style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
        size={size}
      >
        <DropdownMenu.Item onSelect={() => onChange("local")}>
          <Flex align="center" gap="2">
            <Desktop size={12} />
            <Text className={textSizeClass}>Local</Text>
          </Flex>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => onChange("cloud")}>
          <Flex align="center" gap="2">
            <Cloud size={12} />
            <Text className={textSizeClass}>Cloud</Text>
          </Flex>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
