import type {
  SessionConfigOption,
  SessionConfigSelectGroup,
} from "@agentclientprotocol/sdk";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import {
  ArrowsClockwise,
  CaretDown,
  Check,
  Cpu,
  Robot,
  Spinner,
} from "@phosphor-icons/react";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import { Fragment, useMemo } from "react";
import { flattenSelectOptions } from "../stores/sessionStore";

const ADAPTER_ICONS: Record<AgentAdapter, React.ReactNode> = {
  claude: <Robot size={14} weight="regular" />,
  codex: <Cpu size={14} weight="regular" />,
};

const ADAPTER_LABELS: Record<AgentAdapter, string> = {
  claude: "Claude",
  codex: "Codex",
};

function getOtherAdapter(adapter: AgentAdapter): AgentAdapter {
  return adapter === "claude" ? "codex" : "claude";
}

interface UnifiedModelSelectorProps {
  modelOption?: SessionConfigOption;
  adapter: AgentAdapter;
  onAdapterChange: (adapter: AgentAdapter) => void;
  onModelChange?: (model: string) => void;
  disabled?: boolean;
  isConnecting?: boolean;
}

export function UnifiedModelSelector({
  modelOption,
  adapter,
  onAdapterChange,
  onModelChange,
  disabled,
  isConnecting,
}: UnifiedModelSelectorProps) {
  const selectOption = modelOption?.type === "select" ? modelOption : undefined;
  const options = selectOption
    ? flattenSelectOptions(selectOption.options)
    : [];
  const groupedOptions = useMemo(() => {
    if (!selectOption || selectOption.options.length === 0) return [];
    if ("group" in selectOption.options[0]) {
      return selectOption.options as SessionConfigSelectGroup[];
    }
    return [];
  }, [selectOption]);

  const currentValue = selectOption?.currentValue;
  const currentLabel =
    options.find((opt) => opt.value === currentValue)?.name ?? currentValue;

  const otherAdapter = getOtherAdapter(adapter);

  const handleModelSelect = (value: string) => {
    onModelChange?.(value);
  };

  const triggerStyle = {
    fontSize: "var(--font-size-1)",
    color: "var(--gray-11)",
    padding: "4px 8px",
    height: "auto",
    minHeight: "unset",
    gap: "6px",
    userSelect: "none" as const,
  };

  if (isConnecting) {
    return (
      <Button
        variant="ghost"
        color="gray"
        size="1"
        disabled
        style={triggerStyle}
      >
        <Spinner size={12} className="animate-spin" />
        <Text size="1">Loading...</Text>
      </Button>
    );
  }

  const renderModelItems = (models: { value: string; name: string }[]) =>
    models.map((model) => (
      <DropdownMenu.Item
        key={model.value}
        onSelect={() => handleModelSelect(model.value)}
      >
        <Flex align="center" gap="2" style={{ minWidth: "140px" }}>
          <Check
            size={12}
            weight="bold"
            style={{
              flexShrink: 0,
              opacity: model.value === currentValue ? 1 : 0,
            }}
          />
          <Text size="1">{model.name}</Text>
        </Flex>
      </DropdownMenu.Item>
    ));

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger disabled={disabled}>
        <Button variant="ghost" color="gray" size="1" style={triggerStyle}>
          <Flex
            align="center"
            style={{ color: "var(--gray-9)", flexShrink: 0 }}
          >
            {ADAPTER_ICONS[adapter]}
          </Flex>
          <Text size="1">{currentLabel ?? "Model"}</Text>
          <CaretDown
            size={10}
            weight="bold"
            style={{ color: "var(--gray-9)", flexShrink: 0 }}
          />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Content align="start" sideOffset={4} size="1">
        <DropdownMenu.Label>
          <Flex align="center" gap="1">
            {ADAPTER_ICONS[adapter]}
            {ADAPTER_LABELS[adapter]}
          </Flex>
        </DropdownMenu.Label>
        {groupedOptions.length > 0
          ? groupedOptions.map((group, index) => (
              <Fragment key={group.group}>
                {index > 0 && <DropdownMenu.Separator />}
                <DropdownMenu.Label>{group.name}</DropdownMenu.Label>
                {renderModelItems(group.options)}
              </Fragment>
            ))
          : renderModelItems(options)}

        <DropdownMenu.Separator />

        <DropdownMenu.Item
          onSelect={() => onAdapterChange(otherAdapter)}
          color="gray"
        >
          <Flex align="center" gap="2">
            <ArrowsClockwise size={12} weight="bold" />
            <Text size="1">Switch to {ADAPTER_LABELS[otherAdapter]}</Text>
          </Flex>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
