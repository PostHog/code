import type { SessionConfigOption } from "@agentclientprotocol/sdk";
import { Brain, CaretDown, Check } from "@phosphor-icons/react";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import { flattenSelectOptions } from "../stores/sessionStore";

interface ReasoningLevelSelectorProps {
  thoughtOption?: SessionConfigOption;
  adapter?: "claude" | "codex";
  onChange?: (value: string) => void;
  disabled?: boolean;
}

const triggerStyle = {
  fontSize: "var(--font-size-1)",
  color: "var(--gray-11)",
  padding: "4px 8px",
  height: "auto",
  minHeight: "unset",
  gap: "6px",
  userSelect: "none" as const,
};

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
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={disabled}>
        <Button variant="ghost" color="gray" size="1" style={triggerStyle}>
          <Brain
            size={14}
            weight="regular"
            style={{ color: "var(--gray-9)", flexShrink: 0 }}
          />
          <Text size="1">
            {adapter === "codex" ? "Reasoning" : "Effort"}: {activeLabel}
          </Text>
          <CaretDown
            size={10}
            weight="bold"
            style={{ color: "var(--gray-9)", flexShrink: 0 }}
          />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" sideOffset={4} size="1">
        {options.map((level) => (
          <DropdownMenu.Item
            key={level.value}
            onSelect={() => onChange?.(level.value)}
          >
            <Flex align="center" gap="2" style={{ minWidth: "100px" }}>
              <Check
                size={12}
                weight="bold"
                style={{
                  flexShrink: 0,
                  opacity: level.value === activeLevel ? 1 : 0,
                }}
              />
              <Text size="1">{level.name}</Text>
            </Flex>
          </DropdownMenu.Item>
        ))}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
