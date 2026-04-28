import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowSquareOutIcon,
  CheckCircleIcon,
  GitBranchIcon,
  InfoIcon,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Spinner, Text, Tooltip } from "@radix-ui/themes";
import { useGitHubIntegrationCallback } from "@renderer/features/integrations/hooks/useGitHubIntegrationCallback";
import { trpcClient } from "@renderer/trpc/client";
import { IS_DEV } from "@shared/constants/environment";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

export function GitHubIntegrationSection({
  hasGithubIntegration,
}: {
  hasGithubIntegration: boolean;
}) {
  const { repositories, isLoadingRepos } = useRepositoryIntegration();
  const projectId = useAuthStateValue((state) => state.projectId);
  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const invalidateIntegrations = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["integrations", "list"],
    });
  }, [queryClient]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (hasGithubIntegration && connecting) {
      stopPolling();
      setConnecting(false);
    }
  }, [hasGithubIntegration, connecting, stopPolling]);

  useGitHubIntegrationCallback({
    onSuccess: () => {
      stopPolling();
      setConnecting(false);
      invalidateIntegrations();
    },
    onError: (message) => {
      stopPolling();
      setConnecting(false);
      toast.error(message);
    },
    onTimedOut: () => {
      stopPolling();
      setConnecting(false);
    },
  });

  const handleConnect = useCallback(async () => {
    if (!cloudRegion || !projectId) return;
    setConnecting(true);
    try {
      await trpcClient.githubIntegration.startFlow.mutate({
        region: cloudRegion,
        projectId,
      });

      if (IS_DEV) {
        pollTimerRef.current = setInterval(() => {
          invalidateIntegrations();
        }, POLL_INTERVAL_MS);
      }

      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        setConnecting(false);
      }, POLL_TIMEOUT_MS);
    } catch {
      setConnecting(false);
    }
  }, [cloudRegion, projectId, invalidateIntegrations, stopPolling]);

  return (
    <Flex
      align="center"
      justify="between"
      gap="4"
      pb="4"
      style={{ borderBottom: "1px dashed var(--gray-5)" }}
    >
      <Flex align="center" gap="3">
        <Box className="shrink-0 text-(--gray-11)">
          <GitBranchIcon size={20} />
        </Box>
        <Flex direction="column">
          <Text className="font-medium text-(--gray-12) text-sm">
            Code access
          </Text>
          {hasGithubIntegration &&
          !isLoadingRepos &&
          repositories.length > 0 ? (
            <Tooltip
              content={
                <Flex direction="column" gap="1">
                  {repositories.map((repo) => (
                    <Text key={repo} className="text-[13px]">
                      {repo}
                    </Text>
                  ))}
                </Flex>
              }
              side="bottom"
            >
              <Flex align="center" gap="1" className="cursor-help">
                <Text className="text-(--gray-11) text-[13px]">
                  Connected and active ({repositories.length}{" "}
                  {repositories.length === 1 ? "repo" : "repos"})
                </Text>
                <InfoIcon size={13} className="shrink-0 text-(--gray-9)" />
              </Flex>
            </Tooltip>
          ) : (
            <Text className="text-(--gray-11) text-[13px]">
              {hasGithubIntegration
                ? "Connected and active"
                : "Required for the Inbox pipeline to work"}
            </Text>
          )}
        </Flex>
      </Flex>
      {connecting ? (
        <Spinner size="2" />
      ) : hasGithubIntegration ? (
        <Flex align="center" gap="2">
          <CheckCircleIcon
            size={16}
            weight="fill"
            className="text-(--green-9)"
          />
          <Button size="1" variant="soft" onClick={() => void handleConnect()}>
            Update in GitHub
            <ArrowSquareOutIcon size={12} />
          </Button>
        </Flex>
      ) : (
        <Button size="1" onClick={() => void handleConnect()}>
          Connect GitHub
          <ArrowSquareOutIcon size={12} />
        </Button>
      )}
    </Flex>
  );
}
