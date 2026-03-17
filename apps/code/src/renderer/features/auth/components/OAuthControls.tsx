import { useOAuthFlow } from "@features/auth/hooks/useOAuthFlow";
import { Callout, Flex, Spinner } from "@radix-ui/themes";
import posthogIcon from "@renderer/assets/images/posthog-icon.svg";
import { REGION_LABELS } from "@shared/constants/oauth";
import { RegionSelect } from "./RegionSelect";

export function OAuthControls() {
  const {
    region,
    authMode,
    handleAuth,
    handleRegionChange,
    handleCancel,
    isPending,
    errorMessage,
  } = useOAuthFlow();

  return (
    <>
      {errorMessage && (
        <Callout.Root color="red" size="1">
          <Callout.Text>{errorMessage}</Callout.Text>
        </Callout.Root>
      )}

      {isPending && (
        <Callout.Root color="blue" size="1">
          <Callout.Text>Waiting for authorization...</Callout.Text>
        </Callout.Root>
      )}

      <button
        type="button"
        onClick={isPending ? handleCancel : handleAuth}
        disabled={false}
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
          cursor: "pointer",
          backgroundColor: isPending ? "var(--gray-3)" : "var(--accent-9)",
          color: isPending ? "var(--gray-11)" : "var(--accent-contrast)",
          boxShadow: isPending ? "none" : "0 3px 0 -1px var(--accent-8)",
          transition: "opacity 150ms ease, box-shadow 100ms ease",
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

      <Flex direction="column" gap="2" align="center">
        {/* <Text
          size="1"
          style={{ color: "var(--gray-12)", opacity: 0.5 }}
        >
          Redirects to PostHog.com
        </Text> */}

        <RegionSelect
          region={region}
          regionLabel={REGION_LABELS[region]}
          onRegionChange={handleRegionChange}
          disabled={isPending}
        />

        {/* <Text size="2">
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
                create one
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
                sign in
              </button>
            </>
          )}
        </Text> */}
      </Flex>
    </>
  );
}
