import type { SessionConfigSelectGroup } from "@agentclientprotocol/sdk";
import type { AgentAdapter } from "@features/settings/stores/settingsStore";
import {
  ArrowsClockwise,
  Check,
  Cpu,
  Robot,
  Spinner,
} from "@phosphor-icons/react";
import { Button, DropdownMenu, Flex, Text } from "@radix-ui/themes";
import { Fragment, useMemo } from "react";
import { getSessionService } from "../service/service";
import {
  flattenSelectOptions,
  useModelConfigOptionForTask,
  useSessionForTask,
} from "../stores/sessionStore";

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
  taskId?: string;
  adapter: AgentAdapter;
  onAdapterChange: (adapter: AgentAdapter) => void;
  disabled?: boolean;
  isConnecting?: boolean;
}

export function UnifiedModelSelector({
  taskId,
  adapter,
  onAdapterChange,
  disabled,
  isConnecting,
}: UnifiedModelSelectorProps) {
  const session = useSessionForTask(taskId);
  const modelOption = useModelConfigOptionForTask(taskId);

  const options = modelOption ? flattenSelectOptions(modelOption.options) : [];
  const groupedOptions = useMemo(() => {
    if (!modelOption || modelOption.options.length === 0) return [];
    if ("group" in modelOption.options[0]) {
      return modelOption.options as SessionConfigSelectGroup[];
    }
    return [];
  }, [modelOption]);

  const currentValue = modelOption?.currentValue;
  const currentLabel =
    options.find((opt) => opt.value === currentValue)?.name ?? currentValue;

  const otherAdapter = getOtherAdapter(adapter);

  const handleModelSelect = (value: string) => {
    if (taskId && session?.status === "connected" && modelOption) {
      getSessionService().setSessionConfigOption(taskId, modelOption.id, value);
    }
  };

  const triggerStyle = {
    fontSize: "var(--font-size-1)",
    color: "var(--gray-11)",
    padding: "4px 8px",
    marginLeft: "4px",
    height: "auto",
    minHeight: "unset",
    gap: "6px",
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
        <Text size="1" style={{ fontFamily: "var(--font-mono)" }}>
          Loading...
        </Text>
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
          <Text size="1" style={{ fontFamily: "var(--font-mono)" }}>
            {currentLabel ?? "Model"}
          </Text>
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
