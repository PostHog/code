import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { Brain } from "@phosphor-icons/react";
import { Flex, Select, Text } from "@radix-ui/themes";
import { flattenSelectOptions } from "../stores/sessionStore";

interface ReasoningLevelSelectorProps {
  thoughtOption?: SessionConfigOption;
  adapter?: "claude" | "codex";
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export function ReasoningLevelSelector({
  thoughtOption,
  adapter,
  onChange,
  disabled,
}: ReasoningLevelSelectorProps) {
  if (!thoughtOption || thoughtOption.type !== "select") {
    return null;
  }

  const options = flattenSelectOptions(thoughtOption.options);
  if (options.length === 0) return null;
  const activeLevel = thoughtOption.currentValue;
  const activeLabel =
    options.find((opt) => opt.value === activeLevel)?.name ?? activeLevel;

  return (
    <Select.Root
      value={activeLevel}
      onValueChange={(value) => onChange?.(value)}
      disabled={disabled}
      size="1"
    >
      <Select.Trigger
        variant="ghost"
        style={{
          fontSize: "var(--font-size-1)",
          color: "var(--gray-11)",
          padding: "4px 8px",
          marginLeft: "4px",
          height: "auto",
          minHeight: "unset",
          gap: "6px",
        }}
      >
        <Flex align="center" gap="1">
          <Brain
            size={14}
            weight="regular"
            style={{ color: "var(--gray-9)", flexShrink: 0 }}
          />
          <Text size="1">
            {adapter === "codex" ? "Reasoning" : "Effort"}: {activeLabel}
          </Text>
        </Flex>
      </Select.Trigger>
      <Select.Content position="popper" sideOffset={4}>
        {options.map((level) => (
          <Select.Item key={level.value} value={level.value}>
            {level.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select.Root>
  );
}
