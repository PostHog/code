import { DataSourceSetup } from "@features/inbox/components/DataSourceSetup";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { Box, Flex, Select, Text } from "@radix-ui/themes";
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

      {setupSource ? (
        <DataSourceSetup
          source={setupSource}
          onComplete={() => void handleSetupComplete()}
          onCancel={handleSetupCancel}
        />
      ) : (
        <>
          <SignalSourceToggles
            value={displayValues}
            onToggle={(source, enabled) => void handleToggle(source, enabled)}
            sourceStates={sourceStates}
            onSetup={handleSetup}
            evaluations={evaluations}
            evaluationsUrl={evaluationsUrl}
            onToggleEvaluation={(id, enabled) =>
              void handleToggleEvaluation(id, enabled)
            }
          />

          <Box
            p="4"
            style={{
              backgroundColor: "var(--color-panel-solid)",
              border: "1px solid var(--gray-4)",
              borderRadius: "var(--radius-3)",
            }}
          >
            <Flex direction="column" gap="2">
              <Text
                size="2"
                weight="medium"
                style={{ color: "var(--gray-12)" }}
              >
                Your auto-start threshold
              </Text>
              <Text size="1" style={{ color: "var(--gray-11)" }}>
                Automatically start tasks assigned to you for reports at or
                above this priority. Choose &quot;Never&quot; to opt out
                entirely.
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
          </Box>
        </>
      )}
    </Flex>
  );
}
