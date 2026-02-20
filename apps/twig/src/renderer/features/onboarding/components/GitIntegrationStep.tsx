import { useAuthStore } from "@features/auth/stores/authStore";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  GitBranch,
  Warning,
} from "@phosphor-icons/react";
import { Box, Button, Callout, Flex, Spinner, Text } from "@radix-ui/themes";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

interface GitIntegrationStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function GitIntegrationStep({
  onNext,
  onBack,
}: GitIntegrationStepProps) {
  const { client, cloudRegion, projectId } = useAuthStore();
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch integrations
  const { data: integrations, isLoading } = useQuery({
    queryKey: ["integrations", refreshKey],
    queryFn: async () => {
      if (!client) throw new Error("No client available");
      return await client.getIntegrations();
    },
    enabled: !!client,
  });

  const githubIntegration = integrations?.find(
    (integration: { kind: string }) => integration.kind === "github",
  );

  const hasGitIntegration = !!githubIntegration;

  const handleConnectGitHub = () => {
    if (!cloudRegion || !projectId) return;
    const cloudUrl = getCloudUrlFromRegion(cloudRegion);
    const integrationUrl = `${cloudUrl}/project/${projectId}/settings/integrations`;
    window.open(integrationUrl, "_blank");
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleContinue = () => {
    onNext();
  };

  const handleSkip = () => {
    onNext();
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
            Connect your git repository
          </Text>
          <Text
            size="3"
            style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
          >
            Twig needs access to your GitHub repositories to create branches,
            commits, and pull requests.
          </Text>
        </Flex>

        {isLoading ? (
          <Flex align="center" justify="center" py="8">
            <Spinner size="3" />
          </Flex>
        ) : hasGitIntegration ? (
          <Callout.Root color="green">
            <Callout.Icon>
              <CheckCircle size={20} weight="fill" />
            </Callout.Icon>
            <Callout.Text>
              <Flex direction="column" gap="1">
                <Text weight="bold">GitHub connected</Text>
                <Text size="2">
                  Your GitHub integration is active and ready to use.
                </Text>
              </Flex>
            </Callout.Text>
          </Callout.Root>
        ) : (
          <Flex direction="column" gap="4">
            <Box
              p="5"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.7)",
                border: "2px solid rgba(0, 0, 0, 0.1)",
                backdropFilter: "blur(8px)",
              }}
            >
              <Flex direction="column" gap="4" align="center">
                <GitBranch
                  size={48}
                  style={{ color: "var(--cave-charcoal)" }}
                />
                <Flex direction="column" gap="2" align="center">
                  <Text
                    size="4"
                    weight="bold"
                    style={{ color: "var(--cave-charcoal)" }}
                  >
                    No git integration found
                  </Text>
                  <Text
                    size="2"
                    align="center"
                    style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
                  >
                    Connect GitHub to enable agent-powered development
                    workflows.
                  </Text>
                </Flex>
                <Button
                  size="3"
                  onClick={handleConnectGitHub}
                  style={{
                    backgroundColor: "var(--cave-charcoal)",
                    color: "var(--cave-cream)",
                  }}
                >
                  Connect GitHub
                  <ArrowSquareOut size={16} />
                </Button>
                <Button size="2" variant="ghost" onClick={handleRefresh}>
                  Refresh status
                </Button>
              </Flex>
            </Box>

            <Callout.Root color="orange">
              <Callout.Icon>
                <Warning size={20} weight="fill" />
              </Callout.Icon>
              <Callout.Text>
                <Text size="2">
                  You can skip this step, but some features will be limited
                  without git integration.
                </Text>
              </Callout.Text>
            </Callout.Root>
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
          {hasGitIntegration ? (
            <Button
              size="3"
              onClick={handleContinue}
              style={{
                backgroundColor: "var(--cave-charcoal)",
                color: "var(--cave-cream)",
              }}
            >
              Continue
              <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              size="3"
              variant="outline"
              onClick={handleSkip}
              style={{ color: "var(--cave-charcoal)" }}
            >
              Skip for now
              <ArrowRight size={16} />
            </Button>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
}
