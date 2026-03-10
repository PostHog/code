import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useSetHeaderContent } from "@hooks/useSetHeaderContent";
import { EnvelopeSimpleIcon, GearSixIcon } from "@phosphor-icons/react";
import { Box, Button, Flex, Text } from "@radix-ui/themes";
import { useMemo } from "react";
import { useSignalSourceConfigs } from "../hooks/useSignalSourceConfigs";
import { InboxSignalsTab } from "./InboxSignalsTab";

function SignalsNotConfiguredState() {
  const openSettings = useSettingsDialogStore((s) => s.open);

  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="5"
      height="100%"
      px="5"
      style={{ maxWidth: 480, margin: "0 auto" }}
    >
      <Flex direction="column" gap="2" style={{ width: "100%" }}>
        <Text
          size="2"
          weight="medium"
          align="center"
          style={{ color: "var(--gray-12)" }}
        >
          Enable "the inbox"
        </Text>
        <Text size="1" align="center" style={{ color: "var(--gray-11)" }}>
          Automatically analyze your product data and surface actionable
          insights. Choose which sources to enable for this project.
        </Text>
      </Flex>

      <Button size="2" onClick={() => openSettings("signals")}>
        Configure signal sources
      </Button>
    </Flex>
  );
}

export function InboxView() {
  const { data: configs, isLoading } = useSignalSourceConfigs();
  const hasConfigs = configs?.some((c) => c.enabled) ?? false;
  const openSettings = useSettingsDialogStore((s) => s.open);

  const headerContent = useMemo(
    () => (
      <Flex align="center" gap="2" className="w-full min-w-0">
        <EnvelopeSimpleIcon size={12} className="shrink-0 text-gray-10" />
        <Text
          size="1"
          weight="medium"
          className="truncate whitespace-nowrap font-mono text-[12px]"
          title="Inbox"
        >
          Inbox
        </Text>
        <button
          type="button"
          onClick={() => openSettings("signals")}
          className="no-drag ml-auto flex cursor-pointer items-center gap-1 border-0 bg-transparent p-0 font-mono text-[11px] text-gray-10 transition-colors hover:text-gray-12"
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
      {isLoading ? null : hasConfigs ? (
        <InboxSignalsTab />
      ) : (
        <SignalsNotConfiguredState />
      )}
    </Box>
  );
}
