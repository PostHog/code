import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import posthogIcon from "@renderer/assets/images/posthog-icon.svg";
import treeBg from "@renderer/assets/images/tree-bg.svg";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { trpcVanilla } from "@renderer/trpc/client";
import { REGION_LABELS } from "@shared/constants/oauth";
import type { CloudRegion } from "@shared/types/oauth";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
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

type AuthMode = "login" | "signup";

export function AuthScreen() {
  const [region, setRegion] = useState<CloudRegion>("us");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const { loginWithOAuth, signupWithOAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: async () => {
      await loginWithOAuth(region);
    },
  });

  const signupMutation = useMutation({
    mutationFn: async () => {
      await signupWithOAuth(region);
    },
  });

  const handleAuth = () => {
    if (authMode === "login") {
      loginMutation.mutate();
    } else {
      signupMutation.mutate();
    }
  };

  const handleRegionChange = (value: CloudRegion) => {
    setRegion(value);
    loginMutation.reset();
    signupMutation.reset();
  };

  const handleCancel = async () => {
    loginMutation.reset();
    signupMutation.reset();
    await trpcVanilla.oauth.cancelFlow.mutate();
  };

  const isPending = loginMutation.isPending || signupMutation.isPending;
  const isLoading = isPending;
  const error = loginMutation.error || signupMutation.error;
  const errorMessage = getErrorMessage(error);

  return (
    <Flex height="100vh" style={{ position: "relative", overflow: "hidden" }}>
      <DraggableTitleBar />

      {/* Background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "#FAEEDE",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "50%",
          backgroundImage: `url(${treeBg})`,
          backgroundSize: "cover",
          backgroundPosition: "left center",
          backgroundRepeat: "no-repeat",
        }}
      />

      {/* Left side with card */}
      <Flex
        width="50%"
        align="center"
        justify="center"
        style={{ position: "relative", zIndex: 1 }}
      >
        {/* Scrim behind card area */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(247, 237, 223, 0.7) 0%, rgba(247, 237, 223, 0.3) 70%, transparent 100%)",
            pointerEvents: "none",
          }}
        />

        {/* Auth card */}
        <Flex
          direction="column"
          gap="5"
          style={{
            position: "relative",
            width: "360px",
            padding: "32px",
            backgroundColor: "rgba(247, 237, 223, 0.7)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            borderRadius: "16px",
            border: "1px solid rgba(255, 255, 255, 0.3)",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)",
          }}
        >
          {/* Logo */}
          <img
            src={twigLogo}
            alt="Twig"
            style={{
              height: "48px",
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
                border: "none",
                borderRadius: "10px",
                fontSize: "15px",
                fontWeight: 500,
                cursor: isLoading && !isPending ? "not-allowed" : "pointer",
                backgroundColor: isPending
                  ? "var(--gray-8)"
                  : "var(--cave-charcoal)",
                color: isPending ? "var(--gray-11)" : "var(--cave-cream)",
                opacity: isLoading && !isPending ? 0.5 : 1,
                transition: "opacity 150ms ease",
              }}
            >
              {isPending ? (
                <Spinner size="1" />
              ) : (
                <img
                  src={posthogIcon}
                  alt=""
                  style={{ width: "20px", height: "20px" }}
                />
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
              style={{ color: "var(--cave-charcoal)", opacity: 0.5 }}
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
                      color: "var(--cave-charcoal)",
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
                    create one
                  </button>
                </>
              ) : (
                <>
                  <span
                    style={{
                      color: "var(--cave-charcoal)",
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
                    sign in
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
  );
}
