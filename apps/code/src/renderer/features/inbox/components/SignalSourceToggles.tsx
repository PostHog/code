import { Badge } from "@components/ui/Badge";
import {
  ArrowSquareOutIcon,
  BrainIcon,
  BugIcon,
  ChatsIcon,
  CircleNotchIcon,
  GithubLogoIcon,
  KanbanIcon,
  TicketIcon,
  VideoIcon,
} from "@phosphor-icons/react";
import {
  Box,
  Button,
  Flex,
  Link,
  Spinner,
  Switch,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import type {
  Evaluation,
  SignalSourceConfig,
} from "@renderer/api/posthogClient";
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

interface EvaluationRowProps {
  evaluation: Evaluation;
  onToggle: (id: string, enabled: boolean) => void;
}

const EvaluationRow = memo(function EvaluationRow({
  evaluation,
  onToggle,
}: EvaluationRowProps) {
  const handleChange = useCallback(
    (checked: boolean) => onToggle(evaluation.id, checked),
    [onToggle, evaluation.id],
  );

  return (
    <Flex align="center" justify="between" gap="3" py="1" px="2">
      <Text
        size="1"
        style={{
          color: "var(--gray-12)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {evaluation.name}
      </Text>
      <Switch
        size="1"
        checked={evaluation.enabled ?? false}
        onCheckedChange={handleChange}
      />
    </Flex>
  );
});

interface EvaluationsSectionProps {
  evaluations: Evaluation[];
  evaluationsUrl: string;
  onToggleEvaluation: (id: string, enabled: boolean) => void;
}

export const EvaluationsSection = memo(function EvaluationsSection({
  evaluations,
  evaluationsUrl,
  onToggleEvaluation,
}: EvaluationsSectionProps) {
  return (
    <Box
      p="4"
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: "1px solid var(--gray-4)",
        borderRadius: "var(--radius-3)",
      }}
    >
      <Flex direction="column" gap="2">
        <Flex align="center" gap="3">
          <Box style={{ color: "var(--gray-11)", flexShrink: 0 }}>
            <BrainIcon size={20} />
          </Box>
          <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
            <Flex align="center" gap="2">
              <Text
                size="2"
                weight="medium"
                style={{ color: "var(--gray-12)" }}
              >
                PostHog LLM Analytics
              </Text>
              <Tooltip content="This is only visible to staff users of PostHog">
                <Badge color="blue">Internal</Badge>
              </Tooltip>
            </Flex>
            <Text size="1" style={{ color: "var(--gray-11)" }}>
              Ongoing evaluation of how your AI features are performing based on
              defined criteria
            </Text>
          </Flex>
        </Flex>

        <Flex direction="column" gap="2" style={{ marginLeft: 32 }}>
          {evaluations.length > 0 ? (
            <Flex direction="column" gap="1">
              {evaluations.map((evaluation) => (
                <EvaluationRow
                  key={evaluation.id}
                  evaluation={evaluation}
                  onToggle={onToggleEvaluation}
                />
              ))}
            </Flex>
          ) : (
            <Text size="1" style={{ color: "var(--gray-9)" }}>
              No evaluations configured yet.
            </Text>
          )}

          <Link
            href={evaluationsUrl}
            target="_blank"
            rel="noopener"
            size="1"
            style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
          >
            Manage evaluations in PostHog Cloud
            <ArrowSquareOutIcon size={12} />
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
});

function SourceRunningIndicator({
  status,
  message,
}: {
  status: SignalSourceConfig["status"];
  message: string;
}) {
  if (status !== "running") {
    return null;
  }
  return (
    <Flex align="center" gap="2" mt="2">
      <CircleNotchIcon
        size={14}
        className="animate-spin"
        style={{ color: "var(--accent-11)" }}
      />
      <Text size="1" style={{ color: "var(--accent-11)" }}>
        {message}
      </Text>
    </Flex>
  );
}

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
  evaluations?: Evaluation[];
  evaluationsUrl?: string;
  onToggleEvaluation?: (id: string, enabled: boolean) => void;
}

export function SignalSourceToggles({
  value,
  onToggle,
  disabled,
  sourceStates,
  onSetup,
  evaluations,
  evaluationsUrl,
  onToggleEvaluation,
}: SignalSourceTogglesProps) {
  const toggleSessionReplay = useCallback(
    (checked: boolean) => onToggle("session_replay", checked),
    [onToggle],
  );
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
  const toggleConversations = useCallback(
    (checked: boolean) => onToggle("conversations", checked),
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
        description="Surface new issues, reopenings, and volume spikes"
        checked={value.error_tracking}
        onCheckedChange={toggleErrorTracking}
        disabled={disabled}
        syncStatus={sourceStates?.error_tracking?.syncStatus}
      />
      <SignalSourceToggleCard
        icon={<ChatsIcon size={20} />}
        label="PostHog Conversations"
        description="Turn support conversations into signals for the inbox"
        checked={value.conversations}
        onCheckedChange={toggleConversations}
        disabled={disabled}
      />
      <SignalSourceToggleCard
        icon={<VideoIcon size={20} />}
        label="PostHog Session Replay"
        labelSuffix={<Badge color="orange">Alpha</Badge>}
        description="Analyze session recordings and event data for UX issues"
        checked={value.session_replay}
        onCheckedChange={toggleSessionReplay}
        disabled={disabled}
        statusSection={
          value.session_replay ? (
            <SourceRunningIndicator
              status={sourceStates?.session_replay?.syncStatus ?? null}
              message="Session analysis run in progress now…"
            />
          ) : undefined
        }
      />
      {evaluations && evaluationsUrl && onToggleEvaluation && (
        <EvaluationsSection
          evaluations={evaluations}
          evaluationsUrl={evaluationsUrl}
          onToggleEvaluation={onToggleEvaluation}
        />
      )}
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
