import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { ZenHedgehog } from "@components/ZenHedgehog";
import {
  useLoginMutation,
  useSignupMutation,
} from "@features/auth/hooks/authMutations";
import { useAuthUiStateStore } from "@features/auth/stores/authUiStateStore";
import { Callout, Flex, Spinner, Text, Theme } from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
import logomark from "@renderer/assets/images/logomark.svg";
import { trpcClient } from "@renderer/trpc/client";
import type { CloudRegion } from "@shared/types/regions";
import { RegionSelect } from "./RegionSelect";

export const getErrorMessage = (error: unknown) => {
  if (!error) {
    return null;
  }
  if (!(error instanceof Error)) {
    return "Failed to authenticate";
  }
  const message = error.message;

  if (message === "2FA_REQUIRED") {
    return null; // 2FA dialog will handle this
  }

  if (message.includes("access_denied")) {
    return "Authorization cancelled.";
  }

  if (message.includes("timed out")) {
    return "Authorization timed out. Please try again.";
  }

  if (message.includes("SSO login required")) {
    return message;
  }

  return message;
};

export function AuthScreen() {
  const staleRegion = useAuthUiStateStore((state) => state.staleRegion);
  const selectedRegion = useAuthUiStateStore((state) => state.selectedRegion);
  const setSelectedRegion = useAuthUiStateStore(
    (state) => state.setSelectedRegion,
  );
  const authMode = useAuthUiStateStore((state) => state.authMode);
  const setAuthMode = useAuthUiStateStore((state) => state.setAuthMode);
  const loginMutation = useLoginMutation();
  const signupMutation = useSignupMutation();
  const region: CloudRegion = selectedRegion ?? staleRegion ?? "us";

  const handleAuth = () => {
    if (authMode === "login") {
      loginMutation.mutate(region);
    } else {
      signupMutation.mutate(region);
    }
  };

  const handleRegionChange = (value: CloudRegion) => {
    setSelectedRegion(value);
    loginMutation.reset();
    signupMutation.reset();
  };

  const handleCancel = async () => {
    loginMutation.reset();
    signupMutation.reset();
    await trpcClient.oauth.cancelFlow.mutate();
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;
  const isLoading = isPending;
  const error = loginMutation.error || signupMutation.error;
  const errorMessage = getErrorMessage(error);

  return (
    <Theme appearance="light" accentColor="orange" radius="medium">
      <Flex height="100vh" style={{ position: "relative", overflow: "hidden" }}>
        <DraggableTitleBar />

        {/* Background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgb(243, 244, 240)",
          }}
        />

        {/* Right panel — zen hedgehog */}
        <Flex
          align="center"
          justify="center"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: "50%",
            backgroundColor: "rgb(243, 244, 240)",
          }}
        >
          <ZenHedgehog />
        </Flex>

        {/* Left side with card */}
        <Flex
          width="50%"
          align="center"
          justify="center"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* Auth card */}
          <Flex
            direction="column"
            gap="5"
            style={{
              position: "relative",
              width: "360px",
              padding: "32px",
              backgroundColor: "var(--color-panel-solid)",
              borderRadius: "16px",
              border: "1px solid var(--gray-4)",
              boxShadow:
                "0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
            }}
          >
            {/* Logo */}
            <img
              src={codeLogo}
              alt="PostHog"
              style={{
                height: "30px",
                objectFit: "contain",
                alignSelf: "center",
              }}
            />

            {/* Error */}
            {errorMessage && (
              <Callout.Root color="red" size="1">
                <Callout.Text>{errorMessage}</Callout.Text>
              </Callout.Root>
            )}

            {/* Pending state */}
            {isPending && (
              <Callout.Root color="blue" size="1">
                <Callout.Text>Waiting for authorization...</Callout.Text>
              </Callout.Root>
            )}

            {/* Primary CTA */}
            <Flex direction="column" gap="2">
              <button
                type="button"
                onClick={isPending ? handleCancel : handleAuth}
                disabled={isLoading && !isPending}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  width: "100%",
                  height: "44px",
                  border: isPending
                    ? "1.5px solid var(--gray-6)"
                    : "1.5px solid var(--accent-8)",
                  borderRadius: "6px",
                  fontSize: "15px",
                  fontWeight: 500,
                  cursor: isLoading && !isPending ? "not-allowed" : "pointer",
                  backgroundColor: isPending
                    ? "var(--gray-3)"
                    : "var(--accent-9)",
                  color: isPending
                    ? "var(--gray-11)"
                    : "var(--accent-contrast)",
                  boxShadow: isPending
                    ? "none"
                    : "0 3px 0 -1px var(--accent-8)",
                  opacity: isLoading && !isPending ? 0.5 : 1,
                  transition: "opacity 150ms ease, box-shadow 100ms ease",
                }}
              >
                {isPending ? (
                  <Spinner size="1" />
                ) : (
                  <img src={logomark} alt="" style={{ height: "14px" }} />
                )}
                {isPending
                  ? "Cancel"
                  : authMode === "login"
                    ? "Sign in with PostHog"
                    : "Sign up with PostHog"}
              </button>
              <Text
                size="1"
                align="center"
                style={{ color: "var(--gray-12)", opacity: 0.5 }}
              >
                Redirects to PostHog.com
              </Text>
            </Flex>

            {/* Region + secondary links */}
            <Flex direction="column" gap="3" align="center">
              <RegionSelect
                region={region}
                regionLabel={REGION_LABELS[region]}
                onRegionChange={handleRegionChange}
                disabled={isLoading}
              />

              <Text size="2">
                {authMode === "login" ? (
                  <>
                    <span
                      style={{
                        color: "var(--gray-12)",
                        opacity: 0.5,
                      }}
                    >
                      Don&apos;t have an account?{" "}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "var(--accent-9)",
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: "inherit",
                      }}
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      style={{
                        color: "var(--gray-12)",
                        opacity: 0.5,
                      }}
                    >
                      Already have an account?{" "}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAuthMode("login")}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "var(--accent-9)",
                        cursor: "pointer",
                        fontWeight: 500,
                        fontSize: "inherit",
                      }}
                    >
                      Sign in
                    </button>
                  </>
                )}
              </Text>
            </Flex>
          </Flex>
        </Flex>

        {/* Right side - shows background */}
        <div style={{ width: "50%" }} />
      </Flex>
    </Theme>
  );
}
