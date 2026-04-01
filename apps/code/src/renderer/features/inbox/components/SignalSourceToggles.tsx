import {
  ArrowSquareOutIcon,
  BrainIcon,
  BugIcon,
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
} from "@radix-ui/themes";
import type { Evaluation } from "@renderer/api/posthogClient";
import { memo, useCallback } from "react";

export interface SignalSourceValues {
  session_replay: boolean;
  error_tracking: boolean;
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

const SignalSourceToggleCard = memo(function SignalSourceToggleCard({
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
            <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
              LLM evaluations
            </Text>
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

interface SignalSourceTogglesProps {
  value: SignalSourceValues;
  onToggle: (source: keyof SignalSourceValues, enabled: boolean) => void;
  disabled?: boolean;
  sourceStates?: Partial<
    Record<
      keyof SignalSourceValues,
      { requiresSetup: boolean; loading: boolean }
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
  const setupGithub = useCallback(() => onSetup?.("github"), [onSetup]);
  const setupLinear = useCallback(() => onSetup?.("linear"), [onSetup]);
  const setupZendesk = useCallback(() => onSetup?.("zendesk"), [onSetup]);

  return (
    <Flex direction="column" gap="2">
      <SignalSourceToggleCard
        icon={<VideoIcon size={20} />}
        label="PostHog Session Replay"
        description="Analyze session recordings and event data for UX issues"
        checked={value.session_replay}
        onCheckedChange={toggleSessionReplay}
        disabled={disabled}
      />
      <SignalSourceToggleCard
        icon={<BugIcon size={20} />}
        label="PostHog Error Tracking"
        description="Surface new issues, reopenings, and volume spikes"
        checked={value.error_tracking}
        onCheckedChange={toggleErrorTracking}
        disabled={disabled}
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
      />
    </Flex>
  );
}
