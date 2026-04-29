import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useSelectProjectMutation } from "@features/auth/hooks/authMutations";
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
import { Box, Button, Callout, Flex, Skeleton, Text } from "@radix-ui/themes";
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
  const client = useOptionalAuthenticatedClient();
  const selectProjectMutation = useSelectProjectMutation();

  const queryClient = useQueryClient();
  const { projects, projectsWithGithub, isLoading } =
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
  const { repositories, isLoadingRepos } = useRepositoryIntegration();
  const { githubIntegrations } = useIntegrationSelectors();
  const githubIntegration = githubIntegrations[0] ?? null;

  const alternativeConnectedProject = useMemo(() => {
    if (hasGitIntegration) return null;
    if (!projectsWithGithub.length) return null;
    return projectsWithGithub.find((p) => p.id !== selectedProjectId) ?? null;
  }, [hasGitIntegration, projectsWithGithub, selectedProjectId]);

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

      // Dev-only fallback: GitHub returns via posthog-code-dev:// while the
      // browser flow may not always surface the same path; poll integrations.
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

  const handleContinue = () => {
    if (selectedProjectId && selectedProjectId !== currentProjectId) {
      selectProjectMutation.mutate(selectedProjectId);
    }
    onNext();
  };

  return (
    <Flex align="center" height="100%" px="8">
      <Flex
        direction="column"
        align="center"
        className="h-full w-full pt-[24px] pb-[40px]"
      >
        <Flex direction="column" className="min-h-0 flex-1 overflow-y-auto">
          <Flex
            direction="column"
            gap="5"
            style={{ margin: "auto auto" }}
            className="w-full max-w-[560px]"
          >
            {/* Header + content */}
            <Flex direction="column" gap="5" className="w-full">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <Flex direction="column" gap="2">
                  <Text className="font-bold text-(--gray-12) text-2xl">
                    Give your agents access to code
                  </Text>
                  <Text className="text-(--gray-11) text-sm">
                    Point to a local codebase and optionally connect GitHub.
                  </Text>
                </Flex>
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
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  className="rounded-[12px] border border-(--gray-a3) bg-(--color-panel-solid)"
                >
                  <Flex direction="column" gap="4">
                    <Flex direction="column" gap="1">
                      <Flex align="center" gap="2">
                        <FolderOpen size={18} className="text-(--gray-12)" />
                        <Text className="font-bold text-(--gray-12) text-base">
                          Choose your codebase
                        </Text>
                      </Flex>
                      <Text className="text-(--gray-11) text-sm">
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
                              className="animate-spin text-(--gray-9)"
                            />
                            <Text className="text-(--gray-9) text-[13px]">
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
                                style={{
                                  color: repoMatchesGitHub
                                    ? "var(--green-11)"
                                    : "var(--gray-11)",
                                }}
                                className="text-[13px]"
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
                            <Text className="text-(--gray-9) text-[13px]">
                              No git remote detected -- you can still continue.
                            </Text>
                          </motion.div>
                        )}
                    </AnimatePresence>
                  </Flex>
                </Box>
              </motion.div>

              {alternativeConnectedProject && selectedProject && (
                <Callout.Root color="blue" variant="soft">
                  <Callout.Text>
                    GitHub is already connected on{" "}
                    <Text className="font-bold">
                      {alternativeConnectedProject.name}
                    </Text>{" "}
                    ({alternativeConnectedProject.organization.name}). Switch to
                    that project, or click{" "}
                    <Text className="font-bold">Connect GitHub</Text> below to
                    install a new integration on{" "}
                    <Text className="font-bold">{selectedProject.name}</Text>.
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

              {/* GitHub integration */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.1 }}
              >
                <Box
                  p="5"
                  style={{
                    boxShadow:
                      "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                  }}
                  className="rounded-[12px] border border-(--gray-a3) bg-(--color-panel-solid)"
                >
                  <Flex direction="column" gap="3">
                    <Flex align="center" justify="between">
                      <Flex align="center" gap="2">
                        <GitBranch size={18} className="text-(--gray-12)" />
                        <Text className="font-bold text-(--gray-12) text-base">
                          Connect GitHub
                        </Text>
                      </Flex>
                      {isLoading ? (
                        <Skeleton className="h-[16px] w-[80px]" />
                      ) : hasGitIntegration ? (
                        <Flex align="center" gap="1">
                          <CheckCircle
                            size={14}
                            weight="fill"
                            className="text-(--green-9)"
                          />
                          <Text className="text-(--green-11) text-[13px]">
                            Connected
                          </Text>
                        </Flex>
                      ) : null}
                    </Flex>
                    {hasGitIntegration ? (
                      <Flex direction="column" gap="3">
                        <Text className="text-(--gray-11) text-sm">
                          {isLoadingRepos
                            ? "Loading repositories..."
                            : repoSummary
                              ? `Access to ${repoSummary}`
                              : "No repositories found. Check your GitHub app settings."}
                        </Text>
                        <Flex align="center" gap="3">
                          <Button
                            size="1"
                            variant="soft"
                            color="gray"
                            onClick={() => {
                              const config = githubIntegration?.config as
                                | {
                                    installation_id?: number;
                                    account?: {
                                      name?: string;
                                      type?: string;
                                    };
                                  }
                                | undefined;
                              const id = config?.installation_id;
                              const account = config?.account;
                              const url = id
                                ? account?.type === "Organization" &&
                                  account.name
                                  ? `https://github.com/organizations/${account.name}/settings/installations/${id}`
                                  : `https://github.com/settings/installations/${id}`
                                : "https://github.com/settings/installations";
                              trpcClient.os.openExternal.mutate({ url });
                            }}
                          >
                            <GearSix size={12} />
                            Settings
                          </Button>
                          <Button
                            size="1"
                            variant="soft"
                            color="gray"
                            onClick={() => {
                              queryClient.invalidateQueries({
                                queryKey: ["integrations"],
                              });
                            }}
                          >
                            <ArrowsClockwise size={12} />
                            Refresh
                          </Button>
                        </Flex>
                      </Flex>
                    ) : !isLoading ? (
                      <Flex direction="column" gap="3">
                        <Text className="text-(--gray-11) text-sm">
                          {timedOut
                            ? "We didn't hear back from GitHub. If the browser tab was closed, click Connect again."
                            : isConnecting
                              ? "Waiting for GitHub... You'll return here automatically once the install completes."
                              : "Optional. Unlocks cloud agents and pull request workflows."}
                        </Text>
                        <Button
                          size="1"
                          variant="soft"
                          onClick={() => void handleConnectGitHub()}
                          loading={isConnecting}
                          className="self-start"
                        >
                          {isConnecting ? "Retry connection" : "Connect GitHub"}
                          <ArrowSquareOut size={12} />
                        </Button>
                      </Flex>
                    ) : null}
                  </Flex>
                </Box>
              </motion.div>
            </Flex>

            {/* Hog tip */}
            <OnboardingHogTip
              hogSrc={builderHog}
              message="GitHub access lets agents read issues and open pull requests for you."
              delay={0.15}
            />
          </Flex>
        </Flex>

        <StepActions>
          <Button size="3" variant="outline" color="gray" onClick={onBack}>
            <ArrowLeft size={16} weight="bold" />
            Back
          </Button>
          <Button
            size="3"
            onClick={handleContinue}
            disabled={!selectedDirectory}
          >
            Continue
            <ArrowRight size={16} weight="bold" />
          </Button>
        </StepActions>
      </Flex>
    </Flex>
  );
}
