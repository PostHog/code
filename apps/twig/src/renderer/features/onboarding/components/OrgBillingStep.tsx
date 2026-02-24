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
import { AnimatePresence, motion } from "framer-motion";

interface OrgBillingStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function OrgBillingStep({ onNext, onBack }: OrgBillingStepProps) {
  const selectedOrgId = useAuthStore((s) => s.selectedOrgId);
  const selectOrg = useAuthStore((s) => s.selectOrg);

  const { orgsWithBilling, effectiveSelectedOrgId, isLoading, error } =
    useOrganizations();

  const handleContinue = () => {
    if (effectiveSelectedOrgId) {
      if (effectiveSelectedOrgId !== selectedOrgId) {
        selectOrg(effectiveSelectedOrgId);
      }
      onNext();
    }
  };

  const handleSelect = (orgId: string) => {
    selectOrg(orgId);
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex direction="column" gap="6" style={{ width: "100%", maxWidth: 520 }}>
        <Flex direction="column" gap="3">
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
          <Callout.Root color="red" size="1">
            <Callout.Text>
              Failed to load organizations. Please try again later.
            </Callout.Text>
          </Callout.Root>
        )}

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

        <Flex gap="3" align="center">
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
            disabled={!effectiveSelectedOrgId || isLoading}
            style={{
              backgroundColor: "var(--cave-charcoal)",
              color: "var(--cave-cream)",
            }}
          >
            Continue
            <ArrowRight size={16} />
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
