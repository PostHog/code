import { useSelectProjectMutation } from "@features/auth/hooks/authMutations";
import { useAuthStateValue } from "@features/auth/hooks/authQueries";
import { FolderPicker } from "@features/folder-picker/components/FolderPicker";
import { useGithubUserConnect } from "@features/integrations/hooks/useGithubUserConnect";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import {
  useUserGithubIntegrations,
  useUserRepositoryIntegration,
} from "@hooks/useIntegrations";
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
import {
  Box,
  Button,
  DropdownMenu,
  Flex,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import builderHog from "@renderer/assets/images/hedgehogs/builder-hog-03.png";
import { trpcClient } from "@renderer/trpc/client";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import type { DetectedRepo } from "../hooks/useOnboardingFlow";
import { useProjectsWithIntegrations } from "../hooks/useProjectsWithIntegrations";
import { OnboardingHogTip } from "./OnboardingHogTip";
import { StepActions } from "./StepActions";

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
  const currentProjectId = useAuthStateValue((state) => state.projectId);
  const selectProjectMutation = useSelectProjectMutation();

  const queryClient = useQueryClient();
  const { projects, projectsWithGithub, isLoading } =
    useProjectsWithIntegrations();

  const manuallySelectedProjectId = useOnboardingStore(
    (state) => state.selectedProjectId,
  );
  const setSelectedProjectId = useOnboardingStore(
    (state) => state.selectProjectId,
  );

  const selectedProjectId = useMemo(() => {
    if (manuallySelectedProjectId !== null) {
      return manuallySelectedProjectId;
    }
    return currentProjectId ?? projects[0]?.id ?? null;
  }, [manuallySelectedProjectId, currentProjectId, projects]);

  const { state: connectState, connect: handleConnectGitHub } =
    useGithubUserConnect({ projectId: selectedProjectId });
  const isConnecting = connectState === "connecting";
  const timedOut = connectState === "timed-out";
  const canTakeAction = !isConnecting && !timedOut;

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const {
    data: githubUserIntegrations = [],
    isLoading: githubUserIntegrationsLoading,
  } = useUserGithubIntegrations();
  const hasGitIntegration = githubUserIntegrations.length > 0;
  const { repositories, isLoadingRepos } = useUserRepositoryIntegration();
  const githubIntegration = githubUserIntegrations[0] ?? null;

  const alternativeConnectedProjects = useMemo(() => {
    if (hasGitIntegration) return [];
    if (!projectsWithGithub.length) return [];
    return projectsWithGithub.filter((p) => p.id !== selectedProjectId);
  }, [hasGitIntegration, projectsWithGithub, selectedProjectId]);

  const [selectedAlternativeId, setSelectedAlternativeId] = useState<
    number | null
  >(null);

  const selectedAlternative = useMemo(() => {
    if (!alternativeConnectedProjects.length) return null;
    return (
      alternativeConnectedProjects.find(
        (p) => p.id === selectedAlternativeId,
      ) ?? alternativeConnectedProjects[0]
    );
  }, [alternativeConnectedProjects, selectedAlternativeId]);

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
                      {isLoading || githubUserIntegrationsLoading ? (
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
                              const id = githubIntegration?.installation_id;
                              const account = githubIntegration?.account;
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
                              queryClient.invalidateQueries({
                                queryKey: ["user-github-integrations"],
                              });
                            }}
                          >
                            <ArrowsClockwise size={12} />
                            Refresh
                          </Button>
                        </Flex>
                      </Flex>
                    ) : !isLoading && !githubUserIntegrationsLoading ? (
                      selectedProject?.hasGithubIntegration && canTakeAction ? (
                        <Flex direction="column" gap="3">
                          <Text className="text-(--gray-11) text-sm">
                            GitHub is already set up on{" "}
                            <Text className="font-bold">
                              {selectedProject.name}
                            </Text>
                            . Sign in with one click to link your account — no
                            admin approval needed.
                          </Text>
                          <Button
                            size="1"
                            variant="solid"
                            onClick={() => void handleConnectGitHub()}
                            className="self-start"
                          >
                            Sign in with GitHub
                            <ArrowSquareOut size={12} />
                          </Button>
                        </Flex>
                      ) : selectedAlternative &&
                        selectedProject &&
                        canTakeAction ? (
                        <Flex direction="column" gap="3">
                          <Text className="text-(--gray-11) text-sm">
                            GitHub is already connected on{" "}
                            {alternativeConnectedProjects.length > 1 ? (
                              <DropdownMenu.Root>
                                <DropdownMenu.Trigger>
                                  <button
                                    type="button"
                                    className="cursor-pointer border-0 bg-transparent p-0 font-bold text-(--gray-12) underline"
                                  >
                                    {selectedAlternative.name} +{" "}
                                    {alternativeConnectedProjects.length - 1}{" "}
                                    more
                                  </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Content size="1" align="start">
                                  {alternativeConnectedProjects.map((p) => (
                                    <DropdownMenu.Item
                                      key={p.id}
                                      onSelect={() =>
                                        setSelectedAlternativeId(p.id)
                                      }
                                    >
                                      <Text className="text-[13px]">
                                        {p.name}
                                      </Text>
                                      <Text className="ml-2 text-(--gray-10) text-[13px]">
                                        {p.organization.name}
                                      </Text>
                                    </DropdownMenu.Item>
                                  ))}
                                </DropdownMenu.Content>
                              </DropdownMenu.Root>
                            ) : (
                              <>
                                <Text className="font-bold">
                                  {selectedAlternative.name}
                                </Text>{" "}
                                ({selectedAlternative.organization.name})
                              </>
                            )}
                            .
                          </Text>
                          <Flex direction="column" gap="2" align="start">
                            <Button
                              size="1"
                              variant="solid"
                              onClick={() => void handleConnectGitHub()}
                            >
                              Connect GitHub on {selectedProject.name}
                              <ArrowSquareOut size={12} />
                            </Button>
                            <Button
                              size="1"
                              variant="ghost"
                              color="gray"
                              onClick={() =>
                                setSelectedProjectId(selectedAlternative.id)
                              }
                            >
                              Switch to {selectedAlternative.name}
                            </Button>
                          </Flex>
                        </Flex>
                      ) : (
                        <Flex direction="column" gap="3">
                          <Text className="text-(--gray-11) text-sm">
                            {timedOut
                              ? "We didn't hear back from GitHub. If the browser tab was closed, click Connect again."
                              : isConnecting
                                ? "Waiting for GitHub..."
                                : "Optional. Unlocks cloud agents and pull request workflows."}
                          </Text>
                          <Button
                            size="1"
                            variant="soft"
                            onClick={() => void handleConnectGitHub()}
                            loading={isConnecting}
                            className="self-start"
                          >
                            {isConnecting
                              ? "Retry connection"
                              : "Connect GitHub"}
                            <ArrowSquareOut size={12} />
                          </Button>
                        </Flex>
                      )
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
