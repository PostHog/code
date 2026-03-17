import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useLogoutMutation } from "@features/auth/hooks/authMutations";
import {
  useAuthStateValue,
  useCurrentUser,
} from "@features/auth/hooks/authQueries";
import { useSeatStore } from "@features/billing/stores/seatStore";
import { SettingRow } from "@features/settings/components/SettingRow";
import { useSeat } from "@hooks/useSeat";
import { ArrowSquareOut, SignOut } from "@phosphor-icons/react";
import {
  Avatar,
  Badge,
  Button,
  Callout,
  Flex,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { REGION_LABELS } from "@shared/constants/oauth";

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
  const {
    seat,
    isPro,
    isCanceling,
    planLabel,
    activeUntil,
    isLoading: seatLoading,
    error: seatError,
    redirectUrl,
  } = useSeat();
  const { upgradeToPro, cancelSeat, reactivateSeat, clearError } =
    useSeatStore();

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

  const formattedActiveUntil = activeUntil
    ? activeUntil.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

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

      <SettingRow label="Plan" description="Your current subscription plan">
        <Flex align="center" gap="3">
          {seatLoading ? (
            <Spinner size="1" />
          ) : seat ? (
            <>
              <Badge size="2" variant="soft" color={isPro ? "orange" : "gray"}>
                {isPro ? `Pro — $200/mo` : "Free"}
              </Badge>
              {isCanceling && formattedActiveUntil && (
                <Text size="1" color="gray">
                  Cancels {formattedActiveUntil}
                </Text>
              )}
            </>
          ) : (
            <Badge size="2" variant="soft" color="gray">
              No plan
            </Badge>
          )}
        </Flex>
      </SettingRow>

      {seat && (
        <SettingRow
          label="Manage plan"
          description={
            isCanceling
              ? "Your plan will remain active until the end of your billing period"
              : isPro
                ? "Cancel your Pro subscription"
                : "Upgrade to Pro for more credits and cloud execution"
          }
          noBorder
        >
          <Flex direction="column" gap="2" align="end">
            {seatError && !redirectUrl && (
              <Callout.Root color="red" size="1" style={{ maxWidth: 240 }}>
                <Callout.Text>{seatError}</Callout.Text>
              </Callout.Root>
            )}
            {redirectUrl && (
              <Button
                size="1"
                variant="outline"
                color="amber"
                onClick={() => {
                  window.open(redirectUrl, "_blank");
                  clearError();
                }}
              >
                Set up billing
                <ArrowSquareOut size={12} />
              </Button>
            )}
            {!redirectUrl && isCanceling && (
              <Button
                size="1"
                variant="solid"
                onClick={reactivateSeat}
                disabled={seatLoading}
              >
                {seatLoading ? <Spinner size="1" /> : "Reactivate"}
              </Button>
            )}
            {!redirectUrl && !isCanceling && isPro && (
              <Button
                size="1"
                variant="outline"
                color="red"
                onClick={cancelSeat}
                disabled={seatLoading}
              >
                {seatLoading ? <Spinner size="1" /> : "Cancel"}
              </Button>
            )}
            {!redirectUrl && !isCanceling && !isPro && (
              <Button
                size="1"
                variant="solid"
                onClick={upgradeToPro}
                disabled={seatLoading}
              >
                {seatLoading ? <Spinner size="1" /> : "Upgrade to Pro"}
              </Button>
            )}
          </Flex>
        </SettingRow>
      )}
    </Flex>
  );
}
