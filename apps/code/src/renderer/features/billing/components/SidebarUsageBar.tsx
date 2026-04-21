import { useUsage } from "@features/billing/hooks/useUsage";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useSeat } from "@hooks/useSeat";
import { Box, Flex, Progress, Text } from "@radix-ui/themes";

export function SidebarUsageBar() {
  const { usage } = useUsage();
  const { isPro } = useSeat();

  if (isPro || !usage) return null;

  const usagePercent = Math.max(
    usage.sustained.used_percent,
    usage.burst.used_percent,
  );
  const exceeded =
    usage.is_rate_limited || usage.sustained.exceeded || usage.burst.exceeded;

  const handleUpgrade = () => {
    useSettingsDialogStore.getState().open("plan-usage");
  };

  return (
    <Box px="2" py="1.5" className="shrink-0 border-gray-6 border-t">
      <Flex direction="column" gap="1">
        <Flex justify="between" align="center">
          <Text size="1" className="text-gray-11">
            {exceeded ? "Limit reached" : `${Math.round(usagePercent)}% used`}
          </Text>
          <button
            type="button"
            className="bg-transparent font-medium text-[11px] text-accent-11 transition-colors hover:text-accent-12"
            onClick={handleUpgrade}
          >
            Upgrade
          </button>
        </Flex>
        <Progress
          value={Math.min(usagePercent, 100)}
          size="1"
          color={exceeded ? "red" : undefined}
        />
      </Flex>
    </Box>
  );
}
