import { DataSourceSetup } from "@features/inbox/components/DataSourceSetup";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { GitHubIntegrationSection } from "@features/settings/components/sections/GitHubIntegrationSection";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import { useMeQuery } from "@hooks/useMeQuery";
import { Box, Flex, Select, Text, Tooltip } from "@radix-ui/themes";
import type { SignalReportPriority } from "@shared/types";

const PRIORITY_OPTIONS: { value: SignalReportPriority; label: string }[] = [
  { value: "P0", label: "P0 — Critical only" },
  { value: "P1", label: "P1 — High and above" },
  { value: "P2", label: "P2 — Medium and above" },
  { value: "P3", label: "P3 — Low and above" },
  { value: "P4", label: "P4 — All priorities" },
];

const NEVER_VALUE = "__never__";

const USER_PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: NEVER_VALUE, label: "Never — opt out of auto-assigned tasks" },
  ...PRIORITY_OPTIONS,
];

export function SignalSourcesSettings() {
  const {
    displayValues,
    sourceStates,
    setupSource,
    isLoading,
    handleToggle,
    handleSetup,
    handleSetupComplete,
    handleSetupCancel,
    evaluations,
    evaluationsUrl,
    handleToggleEvaluation,
    userAutonomyConfig,
    handleUpdateUserAutonomyPriority,
  } = useSignalSourceManager();

  const { hasGithubIntegration } = useRepositoryIntegration();
  const { data: me } = useMeQuery();
  const isStaff = me?.is_staff ?? false;

  if (isLoading) {
    return (
      <Text size="1" color="gray">
        Loading signal source configurations...
      </Text>
    );
  }

  const userPriorityValue =
    userAutonomyConfig?.autostart_priority ?? NEVER_VALUE;

  return (
    <Flex direction="column" gap="4">
      <Text size="1" color="gray">
        Automatically analyze your product data and surface actionable insights.
        Choose which sources to enable for this project.
      </Text>

      <GitHubIntegrationSection hasGithubIntegration={hasGithubIntegration} />

      <Tooltip
        content="Connect code access to configure signal sources"
        hidden={hasGithubIntegration}
      >
        <Box>
          <Box
            style={
              !hasGithubIntegration
                ? { opacity: 0.45, pointerEvents: "none" }
                : undefined
            }
          >
            {setupSource ? (
              <DataSourceSetup
                source={setupSource}
                onComplete={() => void handleSetupComplete()}
                onCancel={handleSetupCancel}
              />
            ) : (
              <SignalSourceToggles
                value={displayValues}
                onToggle={(source, enabled) =>
                  void handleToggle(source, enabled)
                }
                disabled={!hasGithubIntegration}
                sourceStates={sourceStates}
                onSetup={handleSetup}
                evaluations={isStaff ? evaluations : undefined}
                evaluationsUrl={isStaff ? evaluationsUrl : undefined}
                onToggleEvaluation={
                  isStaff
                    ? (id, enabled) => void handleToggleEvaluation(id, enabled)
                    : undefined
                }
              />
            )}
          </Box>
        </Box>
      </Tooltip>
      <Flex
        direction="column"
        gap="2"
        pt="4"
        style={{ borderTop: "1px dashed var(--gray-5)" }}
      >
        <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
          Your PR auto-start threshold
        </Text>
        <Text size="1" style={{ color: "var(--gray-11)" }}>
          Automatically start tasks assigned to you for reports at or above this
          priority. Choose &quot;Never&quot; to opt out entirely.
        </Text>
        <Select.Root
          value={userPriorityValue}
          onValueChange={(value) =>
            void handleUpdateUserAutonomyPriority(
              value === NEVER_VALUE ? null : value,
            )
          }
        >
          <Select.Trigger style={{ maxWidth: 300 }} />
          <Select.Content>
            {USER_PRIORITY_OPTIONS.map((opt) => (
              <Select.Item key={opt.value} value={opt.value}>
                {opt.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>
    </Flex>
  );
}
