import { useConnectUserGithub } from "@hooks/useConnectUserGithub";
import { ArrowSquareOut, Info } from "@phosphor-icons/react";
import { Button, Callout, Flex, Spinner, Text } from "@radix-ui/themes";

export function CloudRepoFallbackNotice() {
  const { connect, isConnecting, canConnect } = useConnectUserGithub();

  return (
    <Callout.Root color="amber" variant="soft" size="1">
      <Flex align="center" gap="2" justify="between" wrap="wrap">
        <Flex align="start" gap="2" className="min-w-0 flex-1">
          <Callout.Icon>
            <Info size={14} />
          </Callout.Icon>
          <Callout.Text>
            <Text size="1">
              Using your team's GitHub integration. Link your personal GitHub so
              cloud PRs are authored as you.
            </Text>
          </Callout.Text>
        </Flex>
        <Button
          size="1"
          variant="soft"
          color="amber"
          disabled={!canConnect || isConnecting}
          onClick={() => {
            void connect();
          }}
        >
          {isConnecting ? <Spinner size="1" /> : <ArrowSquareOut size={12} />}
          {isConnecting ? "Waiting…" : "Connect GitHub"}
        </Button>
      </Flex>
    </Callout.Root>
  );
}
