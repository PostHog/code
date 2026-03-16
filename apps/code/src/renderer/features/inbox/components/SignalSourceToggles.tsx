import {
  BrainIcon,
  GithubLogoIcon,
  KanbanIcon,
  TicketIcon,
  VideoIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Spinner, Switch, Text } from "@radix-ui/themes";

export interface SignalSourceValues {
  session_replay: boolean;
  llm_analytics: boolean;
  github: boolean;
  linear: boolean;
  zendesk: boolean;
}

interface SignalSourceToggleCardProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresSetup?: boolean;
  onSetup?: () => void;
  loading?: boolean;
}

function SignalSourceToggleCard({
  icon,
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  requiresSetup,
  onSetup,
  loading,
}: SignalSourceToggleCardProps) {
  return (
    <Box
      p="4"
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-4)",
        cursor: disabled || loading ? "default" : "pointer",
      }}
      onClick={
        disabled || loading
          ? undefined
          : requiresSetup
            ? onSetup
            : () => onCheckedChange(!checked)
      }
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
        {loading ? (
          <Spinner size="2" />
        ) : requiresSetup ? (
          <Button
            size="1"
            variant="soft"
            onClick={(e) => {
              e.stopPropagation();
              onSetup?.();
            }}
          >
            Connect
          </Button>
        ) : (
          <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </Flex>
    </Box>
  );
}

interface SignalSourceTogglesProps {
  value: SignalSourceValues;
  onChange: (value: SignalSourceValues) => void;
  disabled?: boolean;
  sourceStates?: Partial<
    Record<
      keyof SignalSourceValues,
      { requiresSetup: boolean; loading: boolean }
    >
  >;
  onSetup?: (source: keyof SignalSourceValues) => void;
}

export function SignalSourceToggles({
  value,
  onChange,
  disabled,
  sourceStates,
  onSetup,
}: SignalSourceTogglesProps) {
  return (
    <Flex direction="column" gap="2">
      <SignalSourceToggleCard
        icon={<VideoIcon size={20} />}
        label="Session replay"
        description="Let PostHog watch session recordings for you, and identify problem patterns."
        checked={value.session_replay}
        onCheckedChange={(checked) =>
          onChange({ ...value, session_replay: checked })
        }
        disabled={disabled}
      />
      <SignalSourceToggleCard
        icon={<BrainIcon size={20} />}
        label="LLM analytics"
        description="Let PostHog evaluate live LLM traces for you, and identify problem patterns."
        checked={value.llm_analytics}
        onCheckedChange={(checked) =>
          onChange({ ...value, llm_analytics: checked })
        }
        disabled={disabled}
      />
      <SignalSourceToggleCard
        icon={<GithubLogoIcon size={20} />}
        label="GitHub"
        description="Let PostHog read GitHub issues for you, and surface action items."
        checked={value.github}
        onCheckedChange={(checked) => onChange({ ...value, github: checked })}
        disabled={disabled}
        requiresSetup={sourceStates?.github?.requiresSetup}
        onSetup={() => onSetup?.("github")}
        loading={sourceStates?.github?.loading}
      />
      <SignalSourceToggleCard
        icon={<KanbanIcon size={20} />}
        label="Linear"
        description="Let PostHog read Linear issues for you, and surface action items."
        checked={value.linear}
        onCheckedChange={(checked) => onChange({ ...value, linear: checked })}
        disabled={disabled}
        requiresSetup={sourceStates?.linear?.requiresSetup}
        onSetup={() => onSetup?.("linear")}
        loading={sourceStates?.linear?.loading}
      />
      <SignalSourceToggleCard
        icon={<TicketIcon size={20} />}
        label="Zendesk"
        description="Let PostHog investigate support tickets for you, and surface action items."
        checked={value.zendesk}
        onCheckedChange={(checked) => onChange({ ...value, zendesk: checked })}
        disabled={disabled}
        requiresSetup={sourceStates?.zendesk?.requiresSetup}
        onSetup={() => onSetup?.("zendesk")}
        loading={sourceStates?.zendesk?.loading}
      />
    </Flex>
  );
}
