import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { EnvelopeSimpleIcon, GearSixIcon } from "@phosphor-icons/react";
import { Box, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { InboxSignalsTab } from "./InboxSignalsTab";

export function InboxView() {
  const openSettings = useSettingsDialogStore((s) => s.open);

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2" className="w-full min-w-0">
        <EnvelopeSimpleIcon size={12} className="shrink-0 text-gray-10" />
        <Text
          size="1"
          weight="medium"
          className="truncate whitespace-nowrap text-[13px]"
          title="Inbox"
        >
          Inbox
        </Text>
        <button
          type="button"
          onClick={() => openSettings("signals")}
          className="no-drag ml-auto flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 text-[12px] text-gray-10 transition-colors hover:text-gray-12"
        >
          <GearSixIcon size={12} />
          <span>Configure signals</span>
        </button>
      </Flex>
    ),
    [openSettings],
  );

  useSetHeaderContent(headerContent);

  return (
    <Box style={{ height: "100%" }}>
      <InboxSignalsTab />
    </Box>
  );
}
