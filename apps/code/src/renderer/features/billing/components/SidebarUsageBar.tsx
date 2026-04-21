import { useUsage } from "@features/billing/hooks/useUsage";
import { isUsageExceeded } from "@features/billing/utils";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useSeat } from "@hooks/useSeat";
import { Box, Flex, Progress, Text } from "@radix-ui/themes";

export function SidebarUsageBar() {
  const { isPro } = useSeat();
  const { usage } = useUsage({ enabled: !isPro });

  if (isPro || !usage) return null;

  const usagePercent = Math.max(
    usage.sustained.used_percent,
    usage.burst.used_percent,
  );
  const exceeded = isUsageExceeded(usage);

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
