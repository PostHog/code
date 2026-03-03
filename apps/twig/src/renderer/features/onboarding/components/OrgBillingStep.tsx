import { useAuthStore } from "@features/auth/stores/authStore";
import { useOrganizations } from "@hooks/useOrganizations";
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import {
  Badge,
  Box,
  Button,
  Callout,
  Flex,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { logger } from "@renderer/lib/logger";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

const log = logger.scope("org-billing-step");

interface OrgBillingStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function OrgBillingStep({ onNext, onBack }: OrgBillingStepProps) {
  const selectedOrgId = useAuthStore((s) => s.selectedOrgId);
  const selectOrg = useAuthStore((s) => s.selectOrg);
  const client = useAuthStore((s) => s.client);
  const queryClient = useQueryClient();
  const [isSwitching, setIsSwitching] = useState(false);

  const { orgsWithBilling, effectiveSelectedOrgId, isLoading, error } =
    useOrganizations();

  const currentUserOrgId = queryClient.getQueryData<{
    organization?: { id: string };
  }>(["currentUser"])?.organization?.id;

  const handleContinue = async () => {
    if (!effectiveSelectedOrgId) return;

    if (effectiveSelectedOrgId !== selectedOrgId) {
      selectOrg(effectiveSelectedOrgId);
    }

    if (client && effectiveSelectedOrgId !== currentUserOrgId) {
      setIsSwitching(true);
      try {
        await client.switchOrganization(effectiveSelectedOrgId);
        await queryClient.invalidateQueries({ queryKey: ["currentUser"] });
      } catch (err) {
        log.error("Failed to switch organization", err);
      } finally {
        setIsSwitching(false);
      }
    }

    onNext();
  };

  const handleSelect = (orgId: string) => {
    selectOrg(orgId);
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        style={{
          width: "100%",
          maxWidth: 520,
          height: "100%",
          paddingTop: 80,
          paddingBottom: 40,
        }}
      >
        <Flex direction="column" gap="3" mb="6">
          <img
            src={twigLogo}
            alt="Twig"
            style={{
              height: "40px",
              objectFit: "contain",
              alignSelf: "flex-start",
            }}
          />
          <Text
            size="6"
            style={{
              fontFamily: "Halfre, serif",
              color: "var(--cave-charcoal)",
              lineHeight: 1.3,
            }}
          >
            Choose your organization
          </Text>
          <Text
            size="3"
            style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
          >
            Select which organization should be billed for your Twig usage.
          </Text>
        </Flex>

        {error && (
          <Callout.Root color="red" size="1" mb="6">
            <Callout.Text>
              Failed to load organizations. Please try again later.
            </Callout.Text>
          </Callout.Root>
        )}

        <Box
          className="scrollbar-hide"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            marginBottom: "var(--space-6)",
          }}
        >
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Flex direction="column" gap="3">
                  <Flex
                    align="center"
                    justify="between"
                    gap="3"
                    px="4"
                    py="3"
                    style={{
                      backgroundColor: "rgba(255, 255, 255, 0.7)",
                      border: "2px solid rgba(0, 0, 0, 0.1)",
                      backdropFilter: "blur(8px)",
                    }}
                  >
                    <Flex align="center" gap="3">
                      <Skeleton style={{ width: "140px", height: "20px" }} />
                    </Flex>
                    <Skeleton
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                      }}
                    />
                  </Flex>
                </Flex>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Flex direction="column" gap="3">
                  {orgsWithBilling.map((org) => (
                    <OrgCard
                      key={org.id}
                      name={org.name}
                      hasActiveBilling={org.has_active_subscription}
                      isSelected={effectiveSelectedOrgId === org.id}
                      onSelect={() => handleSelect(org.id)}
                    />
                  ))}
                </Flex>
              </motion.div>
            )}
          </AnimatePresence>
        </Box>

        <Flex gap="3" align="center" flexShrink="0">
          <Button
            size="3"
            variant="ghost"
            onClick={onBack}
            style={{ color: "var(--cave-charcoal)" }}
          >
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button
            size="3"
            onClick={handleContinue}
            disabled={!effectiveSelectedOrgId || isLoading || isSwitching}
            style={{
              backgroundColor: "var(--cave-charcoal)",
              color: "var(--cave-cream)",
            }}
          >
            {isSwitching ? "Switching..." : "Continue"}
            {!isSwitching && <ArrowRight size={16} />}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

interface OrgCardProps {
  name: string;
  hasActiveBilling: boolean;
  isSelected: boolean;
  onSelect: () => void;
}

function OrgCard({
  name,
  hasActiveBilling,
  isSelected,
  onSelect,
}: OrgCardProps) {
  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      px="4"
      py="3"
      onClick={onSelect}
      style={{
        backgroundColor: "rgba(255, 255, 255, 0.7)",
        border: isSelected
          ? "2px solid var(--accent-9)"
          : "2px solid rgba(0, 0, 0, 0.1)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        backdropFilter: "blur(8px)",
      }}
    >
      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
        <Text
          size="3"
          weight="medium"
          style={{ color: "var(--cave-charcoal)" }}
          truncate
        >
          {name}
        </Text>
        {hasActiveBilling && (
          <Badge color="green" size="1" variant="soft">
            <CheckCircle size={10} weight="fill" />
            Billing active
          </Badge>
        )}
      </Flex>

      <Box
        width="16px"
        height="16px"
        flexShrink="0"
        style={{
          borderRadius: "50%",
          border: isSelected ? "none" : "2px solid rgba(0, 0, 0, 0.2)",
          backgroundColor: isSelected ? "var(--accent-9)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {isSelected && (
          <CheckCircle size={16} weight="fill" style={{ color: "white" }} />
        )}
      </Box>
    </Flex>
  );
}
