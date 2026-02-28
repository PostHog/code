import { DraggableTitleBar } from "@components/DraggableTitleBar";
import { useAuthStore } from "@features/auth/stores/authStore";
import { Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import treeBg from "@renderer/assets/images/tree-bg.svg";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
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

        {/* Invite code card */}
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

          <Text
            size="2"
            align="center"
            style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
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
                  border: "1px solid rgba(0, 0, 0, 0.15)",
                  borderRadius: "10px",
                  fontSize: "15px",
                  backgroundColor: "rgba(255, 255, 255, 0.5)",
                  color: "var(--cave-charcoal)",
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
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "15px",
                  fontWeight: 500,
                  cursor:
                    redeemMutation.isPending || !code.trim()
                      ? "not-allowed"
                      : "pointer",
                  backgroundColor: "var(--cave-charcoal)",
                  color: "var(--cave-cream)",
                  opacity: redeemMutation.isPending || !code.trim() ? 0.5 : 1,
                  transition: "opacity 150ms ease",
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
                color: "var(--cave-charcoal)",
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
  );
}
