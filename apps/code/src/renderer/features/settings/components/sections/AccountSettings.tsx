import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useLogoutMutation } from "@features/auth/hooks/authMutations";
import {
  useAuthStateValue,
  useCurrentUser,
} from "@features/auth/hooks/authQueries";
import { useSeat } from "@hooks/useSeat";
import { SignOut } from "@phosphor-icons/react";
import { Avatar, Badge, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import { REGION_LABELS } from "@shared/types/regions";

export function AccountSettings() {
  const isAuthenticated = useAuthStateValue(
    (state) => state.status === "authenticated",
  );
  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const logoutMutation = useLogoutMutation();
  const client = useOptionalAuthenticatedClient();
  const { data: user, isLoading } = useCurrentUser({
    client,
    enabled: isAuthenticated,
  });
  const { seat, isPro, planLabel } = useSeat();

  const handleLogout = () => {
    logoutMutation.mutate();
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
      <Flex align="center" gap="4" py="4">
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
            {seat && (
              <Badge size="1" variant="soft" color={isPro ? "orange" : "gray"}>
                {planLabel}
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
    </Flex>
  );
}
