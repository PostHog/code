import { useAuthStore } from "@features/auth/stores/authStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { useSettingsStore } from "@features/settings/stores/settingsStore";
import { useFeatureFlag } from "@hooks/useFeatureFlag";
import { Button, Flex, Switch, Text } from "@radix-ui/themes";
import { useTRPC } from "@renderer/trpc";
import { useMutation, useQuery } from "@tanstack/react-query";
import { clearApplicationStorage } from "@utils/clearStorage";
import { toast } from "sonner";

export function AdvancedSettings() {
  const showDebugLogsToggle = useFeatureFlag(
    "posthog-code-background-agent-logs",
  );
  const debugLogsCloudRuns = useSettingsStore((s) => s.debugLogsCloudRuns);
  const setDebugLogsCloudRuns = useSettingsStore(
    (s) => s.setDebugLogsCloudRuns,
  );

  const trpc = useTRPC();

  const { data: memoryCount } = useQuery(trpc.memory.count.queryOptions());

  const seedMutation = useMutation(
    trpc.memory.seed.mutationOptions({
      onSuccess: (count) => {
        toast.success(`Seeded ${count} memories`);
      },
      onError: () => {
        toast.error("Failed to seed memory database");
      },
    }),
  );

  const resetMutation = useMutation(
    trpc.memory.reset.mutationOptions({
      onSuccess: () => {
        toast.success("Memory database reset");
      },
      onError: () => {
        toast.error("Failed to reset memory database");
      },
    }),
  );

  return (
    <Flex direction="column">
      <SettingRow
        label="Reset onboarding"
        description="Re-run the onboarding tutorial on next app restart"
      >
        <Button
          variant="soft"
          size="1"
          onClick={() =>
            useAuthStore.setState({ hasCompletedOnboarding: false })
          }
        >
          Reset
        </Button>
      </SettingRow>
      <SettingRow
        label="Clear application storage"
        description="This will remove all locally stored application data"
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

      <Text
        size="2"
        weight="medium"
        className="mb-2 block border-gray-6 border-t pt-4"
      >
        Knowledge Graph Memory
      </Text>

      <SettingRow
        label="Seed memory database"
        description={
          <Text size="1" color="gray">
            Populate with synthetic data for development.{" "}
            {memoryCount != null && `Currently ${memoryCount} memories stored.`}
          </Text>
        }
      >
        <Button
          variant="soft"
          size="1"
          disabled={seedMutation.isPending}
          onClick={() => seedMutation.mutate()}
        >
          {seedMutation.isPending ? "Seeding..." : "Seed data"}
        </Button>
      </SettingRow>
      <SettingRow
        label="Reset memory database"
        description="Delete all memories and associations"
        noBorder={!showDebugLogsToggle}
      >
        <Button
          variant="soft"
          color="red"
          size="1"
          disabled={resetMutation.isPending}
          onClick={() => resetMutation.mutate()}
        >
          {resetMutation.isPending ? "Resetting..." : "Reset"}
        </Button>
      </SettingRow>

      {showDebugLogsToggle && (
        <SettingRow
          label="Debug logs for cloud runs"
          description="Show debug-level console output in the conversation view for cloud-executed runs"
          noBorder
        >
          <Switch
            checked={debugLogsCloudRuns}
            onCheckedChange={setDebugLogsCloudRuns}
            size="1"
          />
        </SettingRow>
      )}
    </Flex>
  );
}
