import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Callout, Flex, Spinner, Text, Theme } from "@radix-ui/themes";
import phWordmark from "@renderer/assets/images/wordmark-alt.png";
import zenHedgehog from "@renderer/assets/images/zen.png";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export function InviteCodeScreen() {
  const [code, setCode] = useState("");
  const { redeemInviteCode, logout } = useAuthStore();

  const redeemMutation = useMutation({
    mutationFn: async () => {
      await redeemInviteCode(code.trim());
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    redeemMutation.mutate();
  };

  const errorMessage = redeemMutation.error?.message ?? null;

  return (
    <Theme appearance="light" accentColor="orange">
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
          <img
            src={zenHedgehog}
            alt=""
            className="zen-float"
            style={{ width: "340px", maxWidth: "80%" }}
          />
        </Flex>

        {/* Left side with card */}
        <Flex
          width="50%"
          align="center"
          justify="center"
          style={{ position: "relative", zIndex: 1 }}
        >
          {/* Invite code card */}
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
              src={phWordmark}
              alt="PostHog"
              style={{
                height: "48px",
                objectFit: "contain",
                alignSelf: "center",
              }}
            />

            <Text
              size="2"
              align="center"
              style={{ color: "var(--gray-12)", opacity: 0.7 }}
            >
              Enter your invite code to get started
            </Text>

            {/* Error */}
            {errorMessage && (
              <Callout.Root color="red" size="1">
                <Callout.Text>{errorMessage}</Callout.Text>
              </Callout.Root>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <Flex direction="column" gap="3">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Invite code"
                  disabled={redeemMutation.isPending}
                  style={{
                    width: "100%",
                    height: "44px",
                    padding: "0 12px",
                    border: "1px solid var(--gray-6)",
                    borderRadius: "10px",
                    fontSize: "15px",
                    backgroundColor: "var(--gray-2)",
                    color: "var(--gray-12)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="submit"
                  disabled={redeemMutation.isPending || !code.trim()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px",
                    width: "100%",
                    height: "44px",
                    border: "1.5px solid var(--accent-8)",
                    borderRadius: "6px",
                    fontSize: "15px",
                    fontWeight: 500,
                    cursor:
                      redeemMutation.isPending || !code.trim()
                        ? "not-allowed"
                        : "pointer",
                    backgroundColor: "var(--accent-9)",
                    color: "var(--accent-contrast)",
                    boxShadow: "0 3px 0 -1px var(--accent-8)",
                    opacity: redeemMutation.isPending || !code.trim() ? 0.5 : 1,
                    transition: "opacity 150ms ease, box-shadow 100ms ease",
                  }}
                >
                  {redeemMutation.isPending ? <Spinner size="1" /> : "Redeem"}
                </button>
              </Flex>
            </form>

            {/* Log out link */}
            <Flex justify="center">
              <button
                type="button"
                onClick={logout}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--gray-12)",
                  opacity: 0.5,
                  cursor: "pointer",
                  fontSize: "13px",
                }}
              >
                Log out
              </button>
            </Flex>
          </Flex>
        </Flex>

        {/* Right side - shows background */}
        <div style={{ width: "50%" }} />
      </Flex>
    </Theme>
  );
}
