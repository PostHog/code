import { useAuthStore } from "@features/auth/stores/authStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { SignOut } from "@phosphor-icons/react";
import { Avatar, Badge, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { REGION_LABELS } from "@shared/constants/oauth";
import { useQuery } from "@tanstack/react-query";

export function AccountSettings() {
  const { client, isAuthenticated, selectedPlan, logout, cloudRegion } =
    useAuthStore();

  // Fetch current user from PostHog
  const { data: user, isLoading } = useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      if (!client) return null;
      return await client.getCurrentUser();
    },
    enabled: !!client && isAuthenticated,
  });

  const handleLogout = () => {
    logout();
  };

  if (!isAuthenticated) {
    return (
      <Flex direction="column" gap="3" py="4">
        <Text size="2" color="gray">
          You are not currently authenticated. Please sign in from the main
          screen.
        </Text>
      </Flex>
    );
  }

  if (isLoading || !user) {
    return (
      <Flex direction="column" gap="3" py="4">
        <Spinner size="3" />
      </Flex>
    );
  }

  const initials =
    user.first_name && user.last_name
      ? `${user.first_name[0]}${user.last_name[0]}`.toUpperCase()
      : (user.email?.substring(0, 2).toUpperCase() ?? "U");

  return (
    <Flex direction="column">
      <Flex
        align="center"
        gap="4"
        py="4"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Avatar size="4" fallback={initials} radius="full" color="amber" />
        <Flex direction="column" gap="1" style={{ flex: 1 }}>
          <Text size="3" weight="medium">
            {user.first_name && user.last_name
              ? `${user.first_name} ${user.last_name}`
              : user.email}
          </Text>
          <Flex align="center" gap="2">
            <Text size="2" color="gray">
              {user.email}
            </Text>
            {cloudRegion && (
              <Badge size="1" variant="soft">
                {REGION_LABELS[cloudRegion]}
              </Badge>
            )}
            {selectedPlan && (
              <Badge
                size="1"
                variant="soft"
                color={selectedPlan === "pro" ? "orange" : "gray"}
              >
                {selectedPlan === "pro" ? "Pro" : "Free"}
              </Badge>
            )}
          </Flex>
        </Flex>
        <Button
          variant="outline"
          color="red"
          size="1"
          onClick={handleLogout}
          style={{ cursor: "pointer" }}
        >
          <SignOut size={14} />
          Sign out
        </Button>
      </Flex>

      <SettingRow
        label="Plan"
        description="Your current subscription plan"
        noBorder
      >
        <Badge
          size="2"
          variant="soft"
          color={selectedPlan === "pro" ? "orange" : "gray"}
        >
          {selectedPlan === "pro" ? "Pro — $200/mo" : "Free"}
        </Badge>
      </SettingRow>
    </Flex>
  );
}
