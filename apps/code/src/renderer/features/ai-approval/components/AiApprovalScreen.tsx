import { FullScreenLayout } from "@components/FullScreenLayout";
import { useLogoutMutation } from "@features/auth/hooks/authMutations";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { SettingsDialog } from "@features/settings/components/SettingsDialog";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import {
  ArrowSquareOut,
  GearSix,
  Robot,
  SignOut,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button, Callout, Flex, Text } from "@radix-ui/themes";
import { SHORTCUTS } from "@renderer/constants/keyboard-shortcuts";
import { trpcClient } from "@renderer/trpc/client";
import { getCloudUrlFromRegion } from "@shared/utils/urls";
import { motion } from "framer-motion";
import { useHotkeys } from "react-hotkeys-hook";

interface OrgSummary {
  id: string;
  name: string;
}

interface AiApprovalScreenProps {
  currentOrg: OrgSummary | null;
  isAdmin: boolean;
}

export function AiApprovalScreen({
  currentOrg,
  isAdmin,
}: AiApprovalScreenProps) {
  const logoutMutation = useLogoutMutation();
  const openSettings = useSettingsDialogStore((s) => s.open);
  const cloudRegion = useAuthStateValue((s) => s.cloudRegion);

  useHotkeys(SHORTCUTS.SETTINGS, () => openSettings(), {
    preventDefault: true,
    enableOnFormTags: true,
  });

  const approvalUrl = cloudRegion
    ? `${getCloudUrlFromRegion(cloudRegion)}/settings/organization-details#organization-ai-consent`
    : null;

  const openApproval = () => {
    if (!approvalUrl) return;
    void trpcClient.os.openExternal.mutate({ url: approvalUrl });
  };

  const footerLeft = (
    <Button
      size="1"
      variant="ghost"
      color="gray"
      onClick={() => openSettings()}
      style={{ opacity: 0.7 }}
    >
      <GearSix size={14} />
      Settings
    </Button>
  );

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
    <>
      <FullScreenLayout footerLeft={footerLeft} footerRight={footerRight}>
        <Flex align="center" justify="center" height="100%" px="8">
          <Flex
            direction="column"
            style={{
              width: "100%",
              maxWidth: 560,
              paddingTop: 24,
              paddingBottom: 40,
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Flex direction="column" gap="5">
                <Flex direction="column" gap="2">
                  <Flex align="center" gap="2">
                    <Robot
                      size={22}
                      weight="duotone"
                      color="var(--accent-10)"
                    />
                    <Text
                      size="6"
                      weight="bold"
                      style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
                    >
                      PostHog AI needs your approval
                    </Text>
                  </Flex>
                  <Text size="2" style={{ color: "var(--gray-11)" }}>
                    {currentOrg
                      ? `The "${currentOrg.name}" organization hasn't approved AI data processing yet.`
                      : "Your organization hasn't approved AI data processing yet."}{" "}
                    PostHog AI may process identifying user data with external
                    AI providers. Your data won't be used for training models.
                  </Text>
                </Flex>

                <Callout.Root color="amber" size="1" variant="soft">
                  <Callout.Icon>
                    <WarningCircle />
                  </Callout.Icon>
                  <Callout.Text>
                    This feature is not HIPAA-compliant and is not intended for
                    the processing of Protected Health Information ("PHI"). Any
                    Business Associate Agreement ("BAA") you may have entered
                    into with PostHog does not apply to this functionality.
                  </Callout.Text>
                </Callout.Root>

                {isAdmin ? (
                  <Flex direction="column" gap="2">
                    <Button
                      size="3"
                      onClick={openApproval}
                      disabled={!approvalUrl}
                      style={{ width: "100%" }}
                    >
                      Approve in PostHog
                      <ArrowSquareOut size={16} />
                    </Button>
                    <Text size="1" style={{ color: "var(--gray-10)" }}>
                      Opens PostHog in your browser. Come back here once you've
                      approved.
                    </Text>
                  </Flex>
                ) : (
                  <Text size="2" style={{ color: "var(--gray-11)" }}>
                    Ask an organization admin to approve AI data processing.
                  </Text>
                )}
              </Flex>
            </motion.div>
          </Flex>
        </Flex>
      </FullScreenLayout>
      <SettingsDialog />
    </>
  );
}
