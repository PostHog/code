import { FullScreenLayout } from "@components/FullScreenLayout";
import { OnboardingHogTip } from "@features/onboarding/components/OnboardingHogTip";
import { SignOut } from "@phosphor-icons/react";
import { Button, Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import happyHog from "@renderer/assets/images/hedgehogs/happy-hog.png";
import { motion } from "framer-motion";
import {
  useLogoutMutation,
  useRedeemInviteCodeMutation,
} from "../hooks/authMutations";
import { useAuthUiStateStore } from "../stores/authUiStateStore";

export function InviteCodeScreen() {
  const code = useAuthUiStateStore((state) => state.inviteCode);
  const setInviteCode = useAuthUiStateStore((state) => state.setInviteCode);
  const resetInviteCode = useAuthUiStateStore((state) => state.resetInviteCode);
  const redeemMutation = useRedeemInviteCodeMutation();
  const logoutMutation = useLogoutMutation();
  const errorMessage = redeemMutation.error?.message ?? null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    redeemMutation.mutate(code.trim(), {
      onSuccess: () => {
        resetInviteCode();
      },
    });
  };

  const footerRight = (
    <Button
      size="1"
      variant="ghost"
      color="gray"
      onClick={() => logoutMutation.mutate()}
      style={{ opacity: 0.5 }}
    >
      <SignOut size={14} />
      Log out
    </Button>
  );

  return (
    <FullScreenLayout footerRight={footerRight}>
      <Flex align="center" justify="center" height="100%" px="8">
        <Flex
          direction="column"
          align="center"
          style={{
            width: "100%",
            maxWidth: 480,
            height: "100%",
            paddingTop: 24,
            paddingBottom: 40,
          }}
        >
          <Flex
            direction="column"
            justify="center"
            align="center"
            style={{ flex: 1, minHeight: 0, width: "100%" }}
          >
            <Flex
              direction="column"
              align="start"
              gap="6"
              style={{ width: "100%" }}
            >
              <Flex direction="column" gap="5" style={{ width: "100%" }}>
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Flex direction="column" gap="2">
                    <Text
                      size="6"
                      weight="bold"
                      style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                    >
                      Enter your invite code
                    </Text>
                    <Text size="2" style={{ color: "var(--gray-11)" }}>
                      You need an invite code to access PostHog Code.
                    </Text>
                  </Flex>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 }}
                >
                  <form onSubmit={handleSubmit}>
                    <Flex direction="column" gap="3">
                      {errorMessage && (
                        <Callout.Root color="red" size="1">
                          <Callout.Text>{errorMessage}</Callout.Text>
                        </Callout.Root>
                      )}
                      <input
                        type="text"
                        value={code}
                        onChange={(e) => setInviteCode(e.target.value)}
                        placeholder="Invite code"
                        disabled={redeemMutation.isPending}
                        style={{
                          width: "100%",
                          height: 44,
                          padding: "0 14px",
                          border: "1px solid var(--gray-a3)",
                          borderRadius: 10,
                          fontSize: 15,
                          backgroundColor: "var(--color-panel-solid)",
                          color: "var(--gray-12)",
                          outline: "none",
                          boxSizing: "border-box",
                          boxShadow:
                            "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                          fontFamily: "inherit",
                        }}
                      />
                      <Button
                        type="submit"
                        size="3"
                        disabled={redeemMutation.isPending || !code.trim()}
                        style={{ width: "100%" }}
                      >
                        {redeemMutation.isPending ? (
                          <Spinner size="1" />
                        ) : (
                          "Redeem"
                        )}
                      </Button>
                    </Flex>
                  </form>
                </motion.div>
              </Flex>

              <OnboardingHogTip
                hogSrc={happyHog}
                message="Got a code from a friend or the PostHog team? Pop it in above."
                delay={0.1}
              />
            </Flex>
          </Flex>
        </Flex>
      </Flex>
    </FullScreenLayout>
  );
}
