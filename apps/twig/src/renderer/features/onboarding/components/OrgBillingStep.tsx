import { useAuthStore } from "@features/auth/stores/authStore";
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import { Badge, Button, Flex, Spinner, Text } from "@radix-ui/themes";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

interface OrgBillingStepProps {
  onNext: () => void;
  onBack: () => void;
}

interface OrgWithBilling {
  id: string;
  name: string;
  slug: string;
  has_active_subscription: boolean;
  customer_id: string | null;
}

export function OrgBillingStep({ onNext, onBack }: OrgBillingStepProps) {
  const { client, selectedOrgId, selectOrg } = useAuthStore();
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [orgsWithBilling, setOrgsWithBilling] = useState<OrgWithBilling[]>([]);

  // Fetch organizations
  const { data: orgs, isLoading: isLoadingOrgs } = useQuery({
    queryKey: ["organizations"],
    queryFn: async () => {
      if (!client) throw new Error("No client available");
      return await client.getOrganizations();
    },
    enabled: !!client,
  });

  // Fetch billing info for each org
  useEffect(() => {
    if (!orgs || !client) return;

    const fetchBillingInfo = async () => {
      setLoadingBilling(true);
      const orgsWithBillingData = await Promise.all(
        orgs.map(async (org) => {
          try {
            const billing = await client.getOrgBilling(org.id);
            return {
              ...org,
              has_active_subscription: billing.has_active_subscription,
              customer_id: billing.customer_id,
            };
          } catch (_error) {
            // If billing fetch fails, assume no billing
            return {
              ...org,
              has_active_subscription: false,
              customer_id: null,
            };
          }
        }),
      );
      setOrgsWithBilling(orgsWithBillingData);
      setLoadingBilling(false);

      // Auto-select first org with billing, or first org if none have billing
      if (!selectedOrgId) {
        const orgWithBilling = orgsWithBillingData.find(
          (org) => org.has_active_subscription,
        );
        const defaultOrg = orgWithBilling || orgsWithBillingData[0];
        if (defaultOrg) {
          selectOrg(defaultOrg.id);
        }
      }
    };

    fetchBillingInfo();
  }, [orgs, client, selectedOrgId, selectOrg]);

  const isLoading = isLoadingOrgs || loadingBilling;

  const handleContinue = () => {
    if (selectedOrgId) {
      onNext();
    }
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

        {isLoading ? (
          <Flex align="center" justify="center" py="8">
            <Spinner size="3" />
          </Flex>
        ) : (
          <Flex direction="column" gap="3">
            {orgsWithBilling.map((org) => (
              <OrgCard
                key={org.id}
                name={org.name}
                hasActiveBilling={org.has_active_subscription}
                isSelected={selectedOrgId === org.id}
                onSelect={() => selectOrg(org.id)}
              />
            ))}
          </Flex>
        )}

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
            disabled={!selectedOrgId || isLoading}
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
      direction="column"
      gap="3"
      p="5"
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
      <Flex align="center" justify="between">
        <Flex direction="column" gap="1">
          <Text
            size="4"
            weight="bold"
            style={{ color: "var(--cave-charcoal)" }}
          >
            {name}
          </Text>
          <Flex align="center" gap="2">
            {hasActiveBilling ? (
              <Badge color="green" size="1">
                <CheckCircle size={12} weight="fill" />
                Billing active
              </Badge>
            ) : (
              <Badge color="gray" size="1">
                No billing
              </Badge>
            )}
          </Flex>
        </Flex>

        <Button
          size="2"
          variant={isSelected ? "solid" : "outline"}
          style={
            isSelected
              ? {
                  backgroundColor: "var(--accent-9)",
                  color: "white",
                }
              : {
                  color: "var(--cave-charcoal)",
                }
          }
        >
          {isSelected ? "Selected" : "Select"}
        </Button>
      </Flex>
    </Flex>
  );
}
