import { SettingRow } from "@features/settings/components/SettingRow";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { Button, Flex, Switch } from "@radix-ui/themes";
import { clearApplicationStorage } from "@renderer/lib/clearStorage";

export function AdvancedSettings() {
  const debugLogsCloudRuns = useSettingsStore((s) => s.debugLogsCloudRuns);
  const setDebugLogsCloudRuns = useSettingsStore(
    (s) => s.setDebugLogsCloudRuns,
  );

  return (
    <Flex direction="column">
      <SettingRow
        label="Clear application storage"
        description="This will remove all locally stored application data."
      >
        <Button
          variant="soft"
          color="red"
          size="1"
          onClick={clearApplicationStorage}
        >
          Clear all data
        </Button>
      </SettingRow>
      <SettingRow
        label="Debug logs for cloud runs"
        description="Show debug-level console output in the conversation view for cloud-executed runs."
        noBorder
      >
        <Switch
          checked={debugLogsCloudRuns}
          onCheckedChange={setDebugLogsCloudRuns}
          size="1"
        />
      </SettingRow>
    </Flex>
  );
}
