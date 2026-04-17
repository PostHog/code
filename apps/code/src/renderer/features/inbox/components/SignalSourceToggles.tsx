import {
  BugIcon,
  GithubLogoIcon,
  KanbanIcon,
  TicketIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Spinner, Switch, Text } from "@radix-ui/themes";
import type { SignalSourceConfig } from "@renderer/api/posthogClient";
import { memo, useCallback } from "react";

export interface SignalSourceValues {
  session_replay: boolean;
  error_tracking: boolean;
  github: boolean;
  linear: boolean;
  zendesk: boolean;
  conversations: boolean;
}

interface SignalSourceToggleCardProps {
  icon: React.ReactNode;
  label: string;
  labelSuffix?: React.ReactNode;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  requiresSetup?: boolean;
  onSetup?: () => void;
  loading?: boolean;
  statusSection?: React.ReactNode;
  syncStatus?: string | null;
}

function syncStatusLabel(status: string | null | undefined): {
  text: string;
  color: string;
} | null {
  if (!status) return null;
  switch (status) {
    case "running":
      return { text: "Syncing…", color: "var(--amber-11)" };
    case "completed":
      return { text: "Synced", color: "var(--green-11)" };
    case "failed":
      return { text: "Sync failed", color: "var(--red-11)" };
    default:
      return null;
  }
}

const SignalSourceToggleCard = memo(function SignalSourceToggleCard({
  icon,
  label,
  labelSuffix,
  description,
  checked,
  onCheckedChange,
  disabled,
  requiresSetup,
  onSetup,
  loading,
  statusSection,
  syncStatus,
}: SignalSourceToggleCardProps) {
  const statusInfo = checked ? syncStatusLabel(syncStatus) : null;

  return (
    <Box
      p="4"
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-4)",
        borderRadius: "var(--radius-3)",
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
            <Flex align="center" gap="2">
              <Text
                size="2"
                weight="medium"
                style={{ color: "var(--gray-12)" }}
              >
                {label}
              </Text>
              {labelSuffix}
              {statusInfo && (
                <Text size="1" style={{ color: statusInfo.color }}>
                  {statusInfo.text}
                </Text>
              )}
            </Flex>
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
            onClick={(e) => {
              e.stopPropagation();
              onSetup?.();
            }}
          >
            Enable
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
      {statusSection && <Box style={{ marginLeft: 32 }}>{statusSection}</Box>}
    </Box>
  );
});

interface SignalSourceTogglesProps {
  value: SignalSourceValues;
  onToggle: (source: keyof SignalSourceValues, enabled: boolean) => void;
  disabled?: boolean;
  sourceStates?: Partial<
    Record<
      keyof SignalSourceValues,
      {
        requiresSetup: boolean;
        loading: boolean;
        syncStatus?: SignalSourceConfig["status"];
      }
    >
  >;
  onSetup?: (source: keyof SignalSourceValues) => void;
}

export function SignalSourceToggles({
  value,
  onToggle,
  disabled,
  sourceStates,
  onSetup,
}: SignalSourceTogglesProps) {
  const toggleErrorTracking = useCallback(
    (checked: boolean) => onToggle("error_tracking", checked),
    [onToggle],
  );
  const toggleGithub = useCallback(
    (checked: boolean) => onToggle("github", checked),
    [onToggle],
  );
  const toggleLinear = useCallback(
    (checked: boolean) => onToggle("linear", checked),
    [onToggle],
  );
  const toggleZendesk = useCallback(
    (checked: boolean) => onToggle("zendesk", checked),
    [onToggle],
  );
  const setupGithub = useCallback(() => onSetup?.("github"), [onSetup]);
  const setupLinear = useCallback(() => onSetup?.("linear"), [onSetup]);
  const setupZendesk = useCallback(() => onSetup?.("zendesk"), [onSetup]);

  return (
    <Flex direction="column" gap="2">
      <SignalSourceToggleCard
        icon={<BugIcon size={20} />}
        label="PostHog Error Tracking"
        description="Surface new issues, reopenings and volume spikes"
        checked={value.error_tracking}
        onCheckedChange={toggleErrorTracking}
        disabled={disabled}
        syncStatus={sourceStates?.error_tracking?.syncStatus}
      />
      <SignalSourceToggleCard
        icon={<GithubLogoIcon size={20} />}
        label="GitHub Issues"
        description="Monitor new issues and updates"
        checked={value.github}
        onCheckedChange={toggleGithub}
        disabled={disabled}
        requiresSetup={sourceStates?.github?.requiresSetup}
        onSetup={setupGithub}
        loading={sourceStates?.github?.loading}
        syncStatus={sourceStates?.github?.syncStatus}
      />
      <SignalSourceToggleCard
        icon={<KanbanIcon size={20} />}
        label="Linear"
        description="Monitor new issues and updates"
        checked={value.linear}
        onCheckedChange={toggleLinear}
        disabled={disabled}
        requiresSetup={sourceStates?.linear?.requiresSetup}
        onSetup={setupLinear}
        loading={sourceStates?.linear?.loading}
        syncStatus={sourceStates?.linear?.syncStatus}
      />
      <SignalSourceToggleCard
        icon={<TicketIcon size={20} />}
        label="Zendesk"
        description="Monitor incoming support tickets"
        checked={value.zendesk}
        onCheckedChange={toggleZendesk}
        disabled={disabled}
        requiresSetup={sourceStates?.zendesk?.requiresSetup}
        onSetup={setupZendesk}
        loading={sourceStates?.zendesk?.loading}
        syncStatus={sourceStates?.zendesk?.syncStatus}
      />
    </Flex>
  );
}
