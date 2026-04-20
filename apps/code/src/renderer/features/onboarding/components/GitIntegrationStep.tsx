import { useAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useSelectProjectMutation } from "@features/auth/hooks/authMutations";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  GitBranch,
} from "@phosphor-icons/react";
import { Box, Button, Callout, Flex, Skeleton, Text } from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
import { trpcClient } from "@renderer/trpc/client";
import { IS_DEV } from "@shared/constants/environment";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useGitHubIntegrationCallback } from "../../integrations/hooks/useGitHubIntegrationCallback";
import { useProjectsWithIntegrations } from "../hooks/useProjectsWithIntegrations";
import { ProjectSelect } from "./ProjectSelect";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 300_000; // 5 minutes

interface GitIntegrationStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function GitIntegrationStep({
  onNext,
  onBack,
}: GitIntegrationStepProps) {
  const cloudRegion = useAuthStateValue((state) => state.cloudRegion);
  const currentProjectId = useAuthStateValue((state) => state.projectId);
  const client = useAuthenticatedClient();
  const selectProjectMutation = useSelectProjectMutation();

  const queryClient = useQueryClient();
  const { projects, projectsWithGithub, isLoading, isFetching } =
    useProjectsWithIntegrations();

  const isConnecting = useOnboardingStore((state) => state.isConnectingGithub);
  const setConnectingGithub = useOnboardingStore(
    (state) => state.setConnectingGithub,
  );
  const manuallySelectedProjectId = useOnboardingStore(
    (state) => state.selectedProjectId,
  );
  const setSelectedProjectId = useOnboardingStore(
    (state) => state.selectProjectId,
  );
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Determine which project to show:
  // 1. If user manually selected one, use that
  // 2. Current project from auth (matches user's active PostHog project)
  // 3. Fall back to first available
  const selectedProjectId = useMemo(() => {
    if (manuallySelectedProjectId !== null) {
      return manuallySelectedProjectId;
    }
    return currentProjectId ?? projects[0]?.id ?? null;
  }, [manuallySelectedProjectId, currentProjectId, projects]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const hasGitIntegration = selectedProject?.hasGithubIntegration ?? false;

  const connectedAccountName = useMemo(() => {
    const github = selectedProject?.integrations.find(
      (i) => i.kind === "github",
    );
    const name = github?.config?.account?.name;
    return typeof name === "string" && name.length > 0 ? name : null;
  }, [selectedProject]);

  // Surface a banner when the selected project has no integration but some
  // other project does — a common onboarding edge case where the GitHub App is
  // already installed for a different PostHog project/org.
  const alternativeConnectedProject = useMemo(() => {
    if (hasGitIntegration) return null;
    if (!projectsWithGithub.length) return null;
    return projectsWithGithub.find((p) => p.id !== selectedProjectId) ?? null;
  }, [hasGitIntegration, projectsWithGithub, selectedProjectId]);

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

  // Stop polling when integration is detected
  useEffect(() => {
    if (hasGitIntegration && isConnecting) {
      stopPolling();
      setConnectingGithub(false);
      setTimedOut(false);
    }
  }, [hasGitIntegration, isConnecting, setConnectingGithub, stopPolling]);

  // Cleanup on unmount
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
      invalidateProject(projectId ?? selectedProjectId);
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
    if (!cloudRegion || !selectedProjectId || !client) return;
    stopPolling();
    setTimedOut(false);
    setConnectingGithub(true);
    try {
      await trpcClient.githubIntegration.startFlow.mutate({
        region: cloudRegion,
        projectId: selectedProjectId,
      });

      // Dev-only fallback: DeepLinkService skips protocol registration in dev
      // (see registerProtocol), so the browser can't deep-link back.
      if (IS_DEV) {
        pollTimerRef.current = setInterval(() => {
          void queryClient.invalidateQueries({
            queryKey: ["integrations", selectedProjectId],
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

  const handleRefresh = () => {
    invalidateProject(selectedProjectId);
  };

  const handleContinue = () => {
    // Persist the selected project if it's different from current
    if (selectedProjectId && selectedProjectId !== currentProjectId) {
      selectProjectMutation.mutate(selectedProjectId);
    }
    onNext();
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
        <img
          src={codeLogo}
          alt="PostHog"
          style={{
            height: "24px",
            objectFit: "contain",
            alignSelf: "flex-start",
          }}
        />

        <Flex
          direction="column"
          justify="center"
          style={{ flex: 1, minHeight: 0, overflowY: "auto" }}
        >
          <Flex direction="column" gap="6">
            <Flex direction="column" gap="3">
              <Text
                size="6"
                weight="bold"
                style={{
                  color: "var(--gray-12)",
                  lineHeight: 1.3,
                }}
              >
                Connect your Git repository
              </Text>
              <Text size="2" style={{ color: "var(--gray-12)", opacity: 0.7 }}>
                PostHog Code needs access to your GitHub repositories to enable
                cloud runs and PR creation.
              </Text>

              {selectedProject && (
                <Flex direction="column" gap="1">
                  <Text
                    size="1"
                    style={{ color: "var(--gray-12)", opacity: 0.5 }}
                  >
                    {selectedProject.organization.name}
                  </Text>
                  <ProjectSelect
                    projectId={selectedProject.id}
                    projectName={selectedProject.name}
                    projects={projects.map((p) => ({
                      id: p.id,
                      name: p.name,
                    }))}
                    onProjectChange={setSelectedProjectId}
                    disabled={isLoading}
                  />
                </Flex>
              )}
            </Flex>

            {alternativeConnectedProject && selectedProject && (
              <Callout.Root color="blue" variant="soft">
                <Callout.Text>
                  GitHub is already connected on{" "}
                  <Text weight="bold">{alternativeConnectedProject.name}</Text>{" "}
                  ({alternativeConnectedProject.organization.name}). Switch to
                  that project, or click Connect to install a new integration on{" "}
                  <Text weight="bold">{selectedProject.name}</Text>.
                </Callout.Text>
                <Flex mt="2">
                  <Button
                    size="1"
                    variant="soft"
                    onClick={() =>
                      setSelectedProjectId(alternativeConnectedProject.id)
                    }
                  >
                    Switch to {alternativeConnectedProject.name}
                  </Button>
                </Flex>
              </Callout.Root>
            )}

            {/* Consistent status box - same height regardless of connection state */}
            <Box
              p="5"
              style={{
                backgroundColor: "var(--color-panel-solid)",
                border: "1px solid var(--gray-4)",
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
                        <Skeleton style={{ width: "180px", height: "20px" }} />
                        <Skeleton style={{ width: "260px", height: "16px" }} />
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
                          style={{
                            color: "var(--gray-12)",
                            opacity: 0.7,
                          }}
                        >
                          {connectedAccountName
                            ? `Linked to ${connectedAccountName}.`
                            : "Your GitHub integration is active and ready to use."}
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
                          No git integration found
                        </Text>
                        <Text
                          size="2"
                          align="center"
                          style={{
                            color: "var(--gray-12)",
                            opacity: 0.7,
                          }}
                        >
                          Connect GitHub.
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
                  ) : !hasGitIntegration ? (
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
                      <Button size="2" onClick={handleConnectGitHub}>
                        {isConnecting ? "Retry connection" : "Connect GitHub"}
                        <ArrowSquareOut size={16} />
                      </Button>
                      <Text
                        size="1"
                        align="center"
                        style={{
                          color: "var(--gray-12)",
                          opacity: 0.5,
                          maxWidth: 360,
                        }}
                      >
                        {timedOut
                          ? "We didn't hear back from GitHub. If the browser tab was closed, click Connect again."
                          : isConnecting
                            ? "Waiting for GitHub\u2026 You'll return here automatically once the install completes."
                            : "Opens GitHub to authorize the PostHog app"}
                      </Text>
                      <Button
                        size="1"
                        variant="ghost"
                        loading={isFetching}
                        onClick={handleRefresh}
                        style={{ color: "var(--gray-12)" }}
                      >
                        Refresh status
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="action-connected"
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
                        size="1"
                        variant="ghost"
                        loading={isFetching}
                        onClick={handleRefresh}
                        style={{ color: "var(--gray-12)" }}
                      >
                        Refresh status
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Flex>
            </Box>
          </Flex>

          <AnimatePresence>
            {!isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.25, delay: 0.15 }}
              >
                <Flex
                  gap="3"
                  align="center"
                  justify="between"
                  flexShrink="0"
                  mt="6"
                >
                  <Button
                    size="2"
                    variant="ghost"
                    onClick={onBack}
                    style={{ color: "var(--gray-12)" }}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </Button>
                  {hasGitIntegration ? (
                    <Button size="2" onClick={handleContinue}>
                      Continue
                      <ArrowRight size={16} />
                    </Button>
                  ) : (
                    <Button
                      size="2"
                      variant="outline"
                      onClick={handleContinue}
                      style={{ color: "var(--gray-12)" }}
                    >
                      Skip for now
                      <ArrowRight size={16} />
                    </Button>
                  )}
                </Flex>
              </motion.div>
            )}
          </AnimatePresence>
        </Flex>
      </Flex>
    </Flex>
  );
}
