import { useAuthStore } from "@features/auth/stores/authStore";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  GitBranch,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Skeleton, Text } from "@radix-ui/themes";
import twigLogo from "@renderer/assets/images/twig-logo.svg";
import { getCloudUrlFromRegion } from "@shared/constants/oauth";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useProjectsWithIntegrations } from "../hooks/useProjectsWithIntegrations";
import { ProjectSelect } from "./ProjectSelect";

interface GitIntegrationStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function GitIntegrationStep({
  onNext,
  onBack,
}: GitIntegrationStepProps) {
  const cloudRegion = useAuthStore((s) => s.cloudRegion);
  const currentProjectId = useAuthStore((s) => s.projectId);
  const selectProject = useAuthStore((s) => s.selectProject);

  const queryClient = useQueryClient();
  const { projects, projectsWithGithub, isLoading } =
    useProjectsWithIntegrations();

  // User can manually select a different project
  const [manuallySelectedProjectId, setManuallySelectedProjectId] = useState<
    number | null
  >(null);

  // Determine which project to show:
  // 1. If user manually selected one, use that
  // 2. Otherwise, prefer first project with GitHub integration
  // 3. Fall back to current project or first available
  const selectedProjectId = useMemo(() => {
    if (manuallySelectedProjectId !== null) {
      return manuallySelectedProjectId;
    }
    if (projectsWithGithub.length > 0) {
      return projectsWithGithub[0].id;
    }
    return currentProjectId ?? projects[0]?.id ?? null;
  }, [
    manuallySelectedProjectId,
    projectsWithGithub,
    currentProjectId,
    projects,
  ]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId),
    [projects, selectedProjectId],
  );

  const hasGitIntegration = selectedProject?.hasGithubIntegration ?? false;

  const handleConnectGitHub = () => {
    if (!cloudRegion || !selectedProjectId) return;
    const cloudUrl = getCloudUrlFromRegion(cloudRegion);
    const integrationUrl = `${cloudUrl}/project/${selectedProjectId}/settings/project-integrations`;
    window.open(integrationUrl, "_blank");
  };

  const handleRefresh = () => {
    // Re-fetch integrations for the selected project
    queryClient.invalidateQueries({ queryKey: ["integrations"] });
  };

  const handleContinue = () => {
    // Persist the selected project if it's different from current
    if (selectedProjectId && selectedProjectId !== currentProjectId) {
      selectProject(selectedProjectId);
    }
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
            size="1"
            style={{ color: "var(--cave-charcoal)", opacity: 0.7 }}
          >
            Twig needs access to your GitHub repositories to create branches,
            commits, and pull requests.
          </Text>

          {selectedProject && (
            <ProjectSelect
              projectId={selectedProject.id}
              projectName={selectedProject.name}
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
              onProjectChange={setManuallySelectedProjectId}
              disabled={isLoading}
            />
          )}
        </Flex>

        {/* Consistent status box - same height regardless of connection state */}
        <Box
          p="5"
          style={{
            backgroundColor: "rgba(255, 255, 255, 0.7)",
            border: "2px solid rgba(0, 0, 0, 0.1)",
            backdropFilter: "blur(8px)",
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
                    style={{ color: "var(--cave-charcoal)" }}
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
                      style={{ color: "var(--cave-charcoal)" }}
                    >
                      GitHub connected
                    </Text>
                    <Text
                      size="1"
                      align="center"
                      style={{
                        color: "var(--cave-charcoal)",
                        opacity: 0.7,
                      }}
                    >
                      Your GitHub integration is active and ready to use.
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
                      style={{ color: "var(--cave-charcoal)" }}
                    >
                      No git integration found
                    </Text>
                    <Text
                      size="1"
                      align="center"
                      style={{
                        color: "var(--cave-charcoal)",
                        opacity: 0.7,
                      }}
                    >
                      Connect GitHub to enable agent-powered development
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
                  <Button
                    size="2"
                    onClick={handleConnectGitHub}
                    style={{
                      backgroundColor: "var(--cave-charcoal)",
                      color: "var(--cave-cream)",
                    }}
                  >
                    Connect GitHub
                    <ArrowSquareOut size={16} />
                  </Button>
                  <Button size="1" variant="ghost" onClick={handleRefresh}>
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
                  <Button size="1" variant="ghost" onClick={handleRefresh}>
                    Refresh status
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </Flex>
        </Box>

        <AnimatePresence>
          {!isLoading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.25, delay: 0.15 }}
            >
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
                    onClick={handleContinue}
                    style={{ color: "var(--cave-charcoal)" }}
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
  );
}
