import { BrainIcon, VideoIcon } from "@phosphor-icons/react";
import { Box, Flex, Switch, Text } from "@radix-ui/themes";

export interface SignalSourceValues {
  session_replay: boolean;
  llm_analytics: boolean;
}

interface SignalSourceToggleCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function SignalSourceToggleCard({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: SignalSourceToggleCardProps) {
  return (
    <Box
      p="4"
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-4)",
        cursor: disabled ? "default" : "pointer",
      }}
      onClick={disabled ? undefined : () => onCheckedChange(!checked)}
    >
      <Flex align="center" justify="between" gap="4">
        <Flex align="center" gap="3">
          <Box style={{ color: "var(--gray-11)", flexShrink: 0 }}>{icon}</Box>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
              {label}
            </Text>
            <Text size="1" style={{ color: "var(--gray-11)" }}>
              {description}
            </Text>
          </Flex>
        </Flex>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
        />
      </Flex>
    </Box>
  );
}

interface SignalSourceTogglesProps {
  value: SignalSourceValues;
  onChange: (value: SignalSourceValues) => void;
  disabled?: boolean;
}

export function SignalSourceToggles({
  value,
  onChange,
  disabled,
}: SignalSourceTogglesProps) {
  return (
    <Flex direction="column" gap="2">
      <SignalSourceToggleCard
        icon={<VideoIcon size={20} />}
        label="Session replay"
        description="Analyzes session recordings to cluster user behavior patterns."
        checked={value.session_replay}
        onCheckedChange={(checked) =>
          onChange({ ...value, session_replay: checked })
        }
        disabled={disabled}
      />
      <SignalSourceToggleCard
        icon={<BrainIcon size={20} />}
        label="LLM analytics"
        description="Evaluates LLM traces for quality issues and surfaces patterns in your evals."
        checked={value.llm_analytics}
        onCheckedChange={(checked) =>
          onChange({ ...value, llm_analytics: checked })
        }
        disabled={disabled}
      />
    </Flex>
  );
}
