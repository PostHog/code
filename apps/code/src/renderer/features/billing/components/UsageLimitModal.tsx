import { useUsageLimitStore } from "@features/billing/stores/usageLimitStore";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { WarningCircle } from "@phosphor-icons/react";
import { Button, Dialog, Flex, Text } from "@radix-ui/themes";

export function UsageLimitModal() {
  const isOpen = useUsageLimitStore((s) => s.isOpen);
  const context = useUsageLimitStore((s) => s.context);
  const hide = useUsageLimitStore((s) => s.hide);

  const handleUpgrade = () => {
    hide();
    useSettingsDialogStore.getState().open("plan-usage");
  };

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Content
        maxWidth="400px"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={hide}
      >
        <Flex direction="column" gap="3">
          <Flex align="center" gap="2">
            <WarningCircle size={20} weight="bold" color="var(--red-9)" />
            <Dialog.Title className="mb-0">Usage limit reached</Dialog.Title>
          </Flex>
          <Dialog.Description>
            <Text size="2" color="gray">
              {context === "mid-task"
                ? "You've hit your free plan usage limit. Your current task can't continue until usage resets or you upgrade to Pro."
                : "You've reached your free plan usage limit. Upgrade to Pro for unlimited usage."}
            </Text>
          </Dialog.Description>
          <Flex justify="end" gap="3" mt="2">
            <Button type="button" variant="soft" color="gray" onClick={hide}>
              Not now
            </Button>
            <Button type="button" onClick={handleUpgrade}>
              View upgrade options
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
