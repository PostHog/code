import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useGitHubIntegrationCallback } from "@features/integrations/hooks/useGitHubIntegrationCallback";
import { useSettingsDialogStore } from "@features/settings/stores/settingsDialogStore";
import { useConnectUserGithub } from "@hooks/useConnectUserGithub";
import {
  useRepositoryIntegration,
  useUserGithubIntegrations,
} from "@hooks/useIntegrations";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  GithubLogoIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import {
  AlertDialog,
  Box,
  Button,
  Flex,
  Spinner,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { toast } from "@renderer/utils/toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function GitHubSettings() {
  const apiClient = useOptionalAuthenticatedClient();
  const queryClient = useQueryClient();
  const { data: integrations = [], isLoading } = useUserGithubIntegrations();
  const integration = integrations[0];

  const { connect, isConnecting, canConnect } = useConnectUserGithub();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const setSettingsCategory = useSettingsDialogStore(
    (state) => state.setCategory,
  );
  const {
    repositories: teamRepositories,
    hasGithubIntegration: hasTeamIntegration,
    isLoadingRepos: isLoadingTeam,
  } = useRepositoryIntegration();

  useGitHubIntegrationCallback({
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["user-github-integrations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["integrations", "list"],
      });
    },
    onError: (message) => {
      toast.error(message);
    },
  });

  const disconnect = useMutation({
    mutationFn: async (installationId: string) => {
      if (!apiClient) throw new Error("Not authenticated");
      await apiClient.disconnectGithubUserIntegration(installationId);
    },
    onSuccess: async () => {
      setConfirmDisconnect(false);
      toast.success("Disconnected personal GitHub");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["user-github-integrations"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["integrations", "list"],
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect GitHub",
      );
    },
  });

  const accountName = integration?.account?.name?.trim() ?? null;
  const isConnected = !!integration;

  return (
    <Flex direction="column">
      <Flex
        align="center"
        justify="between"
        gap="4"
        py="4"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Flex align="center" gap="3" className="min-w-0">
          <Box className="shrink-0 text-(--gray-11)">
            <GithubLogoIcon size={20} />
          </Box>
          <Flex direction="column" className="min-w-0">
            <Text className="font-medium text-(--gray-12) text-sm">
              Personal GitHub
            </Text>
            {isLoading ? (
              <Text className="text-(--gray-11) text-[13px]">Loading…</Text>
            ) : isConnected ? (
              <Flex align="center" gap="1">
                <CheckCircleIcon
                  size={13}
                  weight="fill"
                  className="shrink-0 text-(--green-9)"
                />
                <Text className="text-(--gray-11) text-[13px]" truncate>
                  Connected{accountName ? ` as ${accountName}` : ""} · used for
                  cloud task PRs
                </Text>
              </Flex>
            ) : (
              <Text className="text-(--gray-11) text-[13px]">
                Connect your personal GitHub so cloud-task PRs are authored as
                you.
              </Text>
            )}
          </Flex>
        </Flex>

        <Flex align="center" gap="2" className="shrink-0">
          {isConnecting ? (
            <Flex align="center" gap="2">
              <Spinner size="2" />
              <Text className="text-(--gray-11) text-[13px]">Waiting…</Text>
            </Flex>
          ) : isConnected ? (
            <>
              <Button
                size="1"
                variant="soft"
                disabled={!canConnect || disconnect.isPending}
                onClick={() => {
                  void connect();
                }}
              >
                Reconnect
                <ArrowSquareOutIcon size={12} />
              </Button>
              <Button
                size="1"
                variant="soft"
                color="red"
                disabled={disconnect.isPending}
                onClick={() => setConfirmDisconnect(true)}
              >
                {disconnect.isPending ? <Spinner size="1" /> : null}
                Disconnect
              </Button>
            </>
          ) : (
            <Button
              size="1"
              disabled={!canConnect}
              onClick={() => {
                void connect();
              }}
            >
              Connect GitHub
              <ArrowSquareOutIcon size={12} />
            </Button>
          )}
        </Flex>
      </Flex>

      <Flex
        align="center"
        justify="between"
        gap="4"
        py="4"
        style={{ borderBottom: "1px solid var(--gray-5)" }}
      >
        <Flex align="center" gap="3" className="min-w-0">
          <Box className="shrink-0 text-(--gray-11)">
            <GithubLogoIcon size={20} />
          </Box>
          <Flex direction="column" className="min-w-0">
            <Text className="font-medium text-(--gray-12) text-sm">
              Project GitHub
            </Text>
            {isLoadingTeam ? (
              <Text className="text-(--gray-11) text-[13px]">Loading…</Text>
            ) : hasTeamIntegration ? (
              teamRepositories.length > 0 ? (
                <Tooltip
                  content={
                    <Flex direction="column" gap="1">
                      {teamRepositories.map((repo) => (
                        <Text key={repo} className="text-[13px]">
                          {repo}
                        </Text>
                      ))}
                    </Flex>
                  }
                  side="bottom"
                >
                  <Flex align="center" gap="1" className="cursor-help">
                    <CheckCircleIcon
                      size={13}
                      weight="fill"
                      className="shrink-0 text-(--green-9)"
                    />
                    <Text className="text-(--gray-11) text-[13px]">
                      Connected · {teamRepositories.length}{" "}
                      {teamRepositories.length === 1 ? "repo" : "repos"}
                    </Text>
                    <InfoIcon size={13} className="shrink-0 text-(--gray-9)" />
                  </Flex>
                </Tooltip>
              ) : (
                <Flex align="center" gap="1">
                  <CheckCircleIcon
                    size={13}
                    weight="fill"
                    className="shrink-0 text-(--green-9)"
                  />
                  <Text className="text-(--gray-11) text-[13px]">
                    Connected
                  </Text>
                </Flex>
              )
            ) : (
              <Text className="text-(--gray-11) text-[13px]">
                No project-level GitHub integration on this team.
              </Text>
            )}
          </Flex>
        </Flex>

        <Flex align="center" gap="2" className="shrink-0">
          <Button
            size="1"
            variant="soft"
            onClick={() => setSettingsCategory("signals")}
          >
            Manage in Signals
          </Button>
        </Flex>
      </Flex>

      <AlertDialog.Root
        open={confirmDisconnect}
        onOpenChange={(open) => {
          if (!disconnect.isPending) setConfirmDisconnect(open);
        }}
      >
        <AlertDialog.Content maxWidth="420px" size="1">
          <AlertDialog.Title className="text-sm">
            Disconnect personal GitHub?
          </AlertDialog.Title>
          <AlertDialog.Description className="text-[13px]">
            <Text color="gray" className="text-[13px]">
              Cloud task PRs will fall back to your team's integration. You can
              reconnect at any time.
            </Text>
          </AlertDialog.Description>
          <Flex justify="end" gap="3" mt="3">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" size="1">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="solid"
              color="red"
              size="1"
              disabled={disconnect.isPending || !integration}
              onClick={() => {
                if (!integration) return;
                disconnect.mutate(integration.installation_id);
              }}
            >
              {disconnect.isPending ? <Spinner size="1" /> : null}
              Disconnect
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Flex>
  );
}
