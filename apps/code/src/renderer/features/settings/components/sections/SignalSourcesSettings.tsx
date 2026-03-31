import { DataSourceSetup } from "@features/inbox/components/DataSourceSetup";
import { SignalSourceToggles } from "@features/inbox/components/SignalSourceToggles";
import { useSignalSourceManager } from "@features/inbox/hooks/useSignalSourceManager";
import { Flex, Text } from "@radix-ui/themes";

export function SignalSourcesSettings() {
  const {
    displayValues,
    sourceStates,
    setupSource,
    isLoading,
    handleChange,
    handleSetup,
    handleSetupComplete,
    handleSetupCancel,
  } = useSignalSourceManager();

  if (isLoading) {
    return (
      <Text size="1" color="gray">
        Loading signal source configurations...
      </Text>
    );
  }

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
        <SignalSourceToggles
          value={displayValues}
          onChange={(v) => void handleChange(v)}
          sourceStates={sourceStates}
          onSetup={handleSetup}
        />
      )}
    </Flex>
  );
}
