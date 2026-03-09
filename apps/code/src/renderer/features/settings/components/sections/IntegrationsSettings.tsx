import { useAuthStore } from "@features/auth/stores/authStore";
import { PlugsConnected } from "@phosphor-icons/react";
import { Badge, Flex, Text } from "@radix-ui/themes";
import { REGION_LABELS } from "@shared/constants/oauth";

export function IntegrationsSettings() {
  const { isAuthenticated, cloudRegion } = useAuthStore();

  return (
    <Flex direction="column">
      <Flex
        align="center"
        gap="4"
        py="4"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Flex
          align="center"
          justify="center"
          style={{
            width: 40,
            height: 40,
            backgroundColor: "var(--accent-3)",
          }}
        >
          <PlugsConnected size={20} style={{ color: "var(--accent-9)" }} />
        </Flex>
        <Flex direction="column" gap="1" style={{ flex: 1 }}>
          <Text size="3" weight="medium">
            PostHog
          </Text>
          <Flex align="center" gap="2">
            <Badge
              size="1"
              variant="soft"
              color={isAuthenticated ? "green" : "gray"}
            >
              {isAuthenticated ? "Connected" : "Not connected"}
            </Badge>
            {cloudRegion && isAuthenticated && (
              <Text size="1" color="gray">
                {REGION_LABELS[cloudRegion]}
              </Text>
            )}
          </Flex>
        </Flex>
      </Flex>

      <Flex direction="column" gap="3" py="4">
        <Text size="2" color="gray">
          PostHog integration is managed through your account. Sign in with
          PostHog to access product autonomy features.
        </Text>
      </Flex>
    </Flex>
  );
}
