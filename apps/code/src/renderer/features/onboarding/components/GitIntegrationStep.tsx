import { useAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useIntegrationSelectors } from "@features/integrations/stores/integrationStore";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { useRepositoryIntegration } from "@hooks/useIntegrations";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  FolderOpen,
  GearSix,
  GitBranch,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Skeleton, Text } from "@radix-ui/themes";
import builderHog from "@renderer/assets/images/hedgehogs/builder-hog-03.png";
import { trpcClient } from "@renderer/trpc/client";
import { IS_DEV } from "@shared/constants/environment";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useGitHubIntegrationCallback } from "../../integrations/hooks/useGitHubIntegrationCallback";
import type { DetectedRepo } from "../hooks/useOnboardingFlow";
import { useProjectsWithIntegrations } from "../hooks/useProjectsWithIntegrations";
import { OnboardingHogTip } from "./OnboardingHogTip";
import { StepActions } from "./StepActions";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000;

interface GitIntegrationStepProps {
  onNext: () => void;
  onBack: () => void;
  selectedDirectory: string;
  detectedRepo: DetectedRepo | null;
  isDetectingRepo: boolean;
  onDirectoryChange: (path: string) => void;
}

export function GitIntegrationStep({
  onNext,
  onBack,
  selectedDirectory,
  detectedRepo,
  isDetectingRepo,
  onDirectoryChange,
}: GitIntegrationStepProps) {
  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const currentProjectId = useAuthStateValue((state) => state.projectId);
  const client = useAuthenticatedClient();

  const queryClient = useQueryClient();
  const { projects, isLoading } = useProjectsWithIntegrations();

  const isConnecting = useOnboardingStore((state) => state.isConnectingGithub);
  const setConnectingGithub = useOnboardingStore(
    (state) => state.setConnectingGithub,
  );
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === currentProjectId),
    [projects, currentProjectId],
  );

  const hasGitIntegration = selectedProject?.hasGithubIntegration ?? false;
  const { repositories, isLoadingRepos } = useRepositoryIntegration();
  const { githubIntegrations } = useIntegrationSelectors();
  const githubIntegration = githubIntegrations[0] ?? null;

  const repoSummary = useMemo(() => {
    if (repositories.length === 0) return null;
    const names = repositories.map((r) => r.split("/").pop() ?? r);
    if (names.length <= 2) return names.join(" and ");
    return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
  }, [repositories]);

  const repoMatchesGitHub = useMemo(() => {
    if (!detectedRepo || repositories.length === 0) return false;
    return repositories.some(
      (r) => r.toLowerCase() === detectedRepo.fullName.toLowerCase(),
    );
  }, [detectedRepo, repositories]);

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

  useEffect(() => {
    if (hasGitIntegration && isConnecting) {
      stopPolling();
      setConnectingGithub(false);
      setTimedOut(false);
    }
  }, [hasGitIntegration, isConnecting, setConnectingGithub, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const invalidateProject = useCallback(
    (projectId: number | null) => {
      if (projectId === null) {
        void queryClient.invalidateQueries({ queryKey: ["integrations"] });
        return;
      }
      void queryClient.invalidateQueries({
        queryKey: ["integrations", projectId],
      });
    },
    [queryClient],
  );

  useGitHubIntegrationCallback({
    onSuccess: (projectId) => {
      stopPolling();
      setTimedOut(false);
      setConnectingGithub(false);
      invalidateProject(projectId ?? currentProjectId);
    },
    onError: (message) => {
      stopPolling();
      setTimedOut(false);
      setConnectingGithub(false);
      toast.error(message);
    },
    onTimedOut: () => {
      stopPolling();
      setConnectingGithub(false);
      setTimedOut(true);
    },
  });

  const handleConnectGitHub = async () => {
    if (!cloudRegion || !currentProjectId || !client) return;
    stopPolling();
    setTimedOut(false);
    setConnectingGithub(true);
    try {
      await trpcClient.githubIntegration.startFlow.mutate({
        region: cloudRegion,
        projectId: currentProjectId,
      });

      // Dev-only fallback: DeepLinkService skips protocol registration in dev
      // (see registerProtocol), so the browser can't deep-link back.
      if (IS_DEV) {
        pollTimerRef.current = setInterval(() => {
          void queryClient.invalidateQueries({
            queryKey: ["integrations", currentProjectId],
          });
        }, POLL_INTERVAL_MS);
      }

      // Safety timeout in case the subscription drops or the user abandons the browser.
      pollTimeoutRef.current = setTimeout(() => {
        stopPolling();
        setConnectingGithub(false);
        setTimedOut(true);
      }, POLL_TIMEOUT_MS);
    } catch {
      setConnectingGithub(false);
    }
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        align="center"
        style={{
          width: "100%",
          height: "100%",
          paddingTop: 24,
          paddingBottom: 40,
        }}
      >
        <Flex
          direction="column"
          justify="center"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex
            direction="column"
            gap="6"
            style={{ width: "100%", maxWidth: 560, margin: "0 auto" }}
          >
            {/* Header + content */}
            <Flex direction="column" gap="5" style={{ width: "100%" }}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Text
                  size="6"
                  weight="bold"
                  style={{
                    color: "var(--gray-12)",
                    lineHeight: 1.3,
                  }}
                >
                  Give your agent access to code
                </Text>
              </motion.div>

              {/* Local folder picker */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.05 }}
              >
                <Box
                  p="5"
                  style={{
                    backgroundColor: "var(--color-panel-solid)",
                    border: "1px solid var(--gray-a3)",
                    borderRadius: 12,
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}
                >
                  <Flex direction="column" gap="4">
                    <Flex direction="column" gap="1">
                      <Flex align="center" gap="2">
                        <FolderOpen
                          size={18}
                          style={{ color: "var(--gray-12)" }}
                        />
                        <Text
                          size="3"
                          weight="bold"
                          style={{ color: "var(--gray-12)" }}
                        >
                          Choose your codebase
                        </Text>
                      </Flex>
                      <Text size="2" style={{ color: "var(--gray-11)" }}>
                        Select the local folder for your project so we can
                        analyze it.
                      </Text>
                    </Flex>
                    <FolderPicker
                      value={selectedDirectory}
                      onChange={onDirectoryChange}
                      placeholder="Select folder..."
                      size="2"
                    />
                    <AnimatePresence mode="wait">
                      {isDetectingRepo && (
                        <motion.div
                          key="detecting"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Flex align="center" gap="2">
                            <CircleNotch
                              size={14}
                              style={{
                                color: "var(--gray-9)",
                                animation: "spin 1s linear infinite",
                              }}
                            />
                            <Text size="1" style={{ color: "var(--gray-9)" }}>
                              Detecting repository...
                            </Text>
                          </Flex>
                        </motion.div>
                      )}
                      {!isDetectingRepo &&
                        selectedDirectory &&
                        detectedRepo && (
                          <motion.div
                            key="detected"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Flex align="center" gap="2">
                              <CheckCircle
                                size={14}
                                weight="fill"
                                style={{
                                  color: repoMatchesGitHub
                                    ? "var(--green-9)"
                                    : "var(--gray-9)",
                                }}
                              />
                              <Text
                                size="1"
                                style={{
                                  color: repoMatchesGitHub
                                    ? "var(--green-11)"
                                    : "var(--gray-11)",
                                }}
                              >
                                {repoMatchesGitHub
                                  ? `Linked to ${detectedRepo.fullName} on GitHub`
                                  : `Detected ${detectedRepo.fullName}`}
                              </Text>
                            </Flex>
                          </motion.div>
                        )}
                      {!isDetectingRepo &&
                        selectedDirectory &&
                        !detectedRepo && (
                          <motion.div
                            key="no-repo"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                          >
                            <Text size="1" style={{ color: "var(--gray-9)" }}>
                              No git remote detected -- you can still continue.
                            </Text>
                          </motion.div>
                        )}
                    </AnimatePresence>
                  </Flex>
                </Box>
              </motion.div>

              {/* GitHub integration */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <Box
                  p="5"
                  style={{
                    backgroundColor: "var(--color-panel-solid)",
                    border: "1px solid var(--gray-a3)",
                    borderRadius: 12,
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}
                >
                  <Flex direction="column" gap="4" align="center">
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div
                          key="icon-skeleton"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Skeleton
                            style={{
                              width: "32px",
                              height: "32px",
                              borderRadius: "8px",
                            }}
                          />
                        </motion.div>
                      ) : hasGitIntegration ? (
                        <motion.div
                          key="icon-connected"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2 }}
                        >
                          <CheckCircle
                            size={32}
                            weight="fill"
                            style={{ color: "var(--green-9)" }}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key="icon-disconnected"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.2 }}
                        >
                          <GitBranch
                            size={32}
                            style={{ color: "var(--gray-12)" }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <Flex direction="column" gap="2" align="center">
                      <AnimatePresence mode="wait">
                        {isLoading ? (
                          <motion.div
                            key="text-skeleton"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <Skeleton
                              style={{ width: "180px", height: "20px" }}
                            />
                            <Skeleton
                              style={{ width: "260px", height: "16px" }}
                            />
                          </motion.div>
                        ) : hasGitIntegration ? (
                          <motion.div
                            key="text-connected"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2, delay: 0.05 }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              alignItems: "center",
                              width: "100%",
                            }}
                          >
                            <Text
                              size="3"
                              weight="bold"
                              style={{ color: "var(--gray-12)" }}
                            >
                              GitHub connected
                            </Text>
                            <Text
                              size="2"
                              align="center"
                              style={{ color: "var(--gray-11)" }}
                            >
                              {isLoadingRepos
                                ? "Loading repositories..."
                                : repoSummary
                                  ? `Access to ${repoSummary}`
                                  : "No repositories found. Check your GitHub app settings."}
                            </Text>
                          </motion.div>
                        ) : (
                          <motion.div
                            key="text-disconnected"
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2, delay: 0.05 }}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              size="3"
                              weight="bold"
                              style={{ color: "var(--gray-12)" }}
                            >
                              Connect GitHub
                            </Text>
                            <Text
                              size="2"
                              align="center"
                              style={{ color: "var(--gray-11)" }}
                            >
                              Optional. Unlocks cloud agents and pull request
                              workflows.
                            </Text>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Flex>
                    <AnimatePresence mode="wait">
                      {isLoading ? (
                        <motion.div
                          key="action-skeleton"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <Skeleton
                            style={{
                              width: "160px",
                              height: "32px",
                              borderRadius: "6px",
                            }}
                          />
                        </motion.div>
                      ) : hasGitIntegration ? (
                        <motion.div
                          key="action-connected"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2, delay: 0.1 }}
                        >
                          <Flex gap="2" align="center">
                            <Button
                              size="2"
                              variant="soft"
                              color="gray"
                              onClick={() => {
                                const config = githubIntegration?.config as
                                  | Record<string, unknown>
                                  | undefined;
                                const installationId = config?.installation_id;
                                const url = installationId
                                  ? `https://github.com/settings/installations/${installationId}`
                                  : "https://github.com/settings/installations";
                                window.open(url, "_blank");
                              }}
                            >
                              <GearSix size={16} />
                              Settings
                            </Button>
                            <Button
                              size="2"
                              variant="soft"
                              color="gray"
                              onClick={() => {
                                queryClient.invalidateQueries({
                                  queryKey: ["integrations"],
                                });
                              }}
                            >
                              <ArrowsClockwise size={16} />
                              Refresh
                            </Button>
                          </Flex>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="action-disconnected"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: 0.2, delay: 0.1 }}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                            alignItems: "center",
                          }}
                        >
                          <Button
                            size="2"
                            variant="outline"
                            onClick={() => void handleConnectGitHub()}
                            loading={isConnecting}
                          >
                            {isConnecting ? "Retry connection" : "Connect GitHub"}
                            <ArrowSquareOut size={16} />
                          </Button>
                          <Text
                            size="1"
                            align="center"
                            style={{
                              color: "var(--gray-11)",
                              maxWidth: 360,
                            }}
                          >
                            {timedOut
                              ? "We didn't hear back from GitHub. If the browser tab was closed, click Connect again."
                              : isConnecting
                                ? "Waiting for GitHub... You'll return here automatically once the install completes."
                                : "Opens GitHub to authorize the PostHog app"}
                          </Text>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Flex>
                </Box>
              </motion.div>
            </Flex>

            {/* Hog tip */}
            <OnboardingHogTip
              hogSrc={builderHog}
              message="GitHub access lets agents read issues and open PRs for you."
              delay={0.15}
            />
          </Flex>
        </Flex>

        <StepActions>
          <Button size="3" variant="outline" color="gray" onClick={onBack}>
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button size="3" onClick={onNext} disabled={!selectedDirectory}>
            Continue
            <ArrowRight size={16} />
          </Button>
        </StepActions>
      </Flex>
    </Flex>
  );
}
