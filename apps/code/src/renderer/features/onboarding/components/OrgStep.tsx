import { useAuthenticatedClient } from "@features/auth/hooks/authClient";
import {
  authKeys,
  useAuthStateValue,
  useCurrentUser,
} from "@features/auth/hooks/authQueries";
import { useOnboardingStore } from "@features/onboarding/stores/onboardingStore";
import { useProjects } from "@features/projects/hooks/useProjects";
import { useOrganizations } from "@hooks/useOrganizations";
import { ArrowLeft, ArrowRight, CheckCircle } from "@phosphor-icons/react";
import {
  Box,
  Button,
  Callout,
  Flex,
  Select,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import codeLogo from "@renderer/assets/images/code.svg";
import { trpcClient } from "@renderer/trpc/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";

const log = logger.scope("org-step");

interface OrgStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function OrgStep({ onNext, onBack }: OrgStepProps) {
  const selectedOrgId = useOnboardingStore((state) => state.selectedOrgId);
  const selectOrg = useOnboardingStore((state) => state.selectOrg);
  const manuallySelectedProjectId = useOnboardingStore(
    (state) => state.selectedProjectId,
  );
  const setSelectedProjectId = useOnboardingStore(
    (state) => state.selectProjectId,
  );
  const client = useAuthenticatedClient();
  const { data: currentUser } = useCurrentUser({ client });
  const currentProjectId = useAuthStateValue((state) => state.projectId);
  const queryClient = useQueryClient();

  const switchOrganizationMutation = useMutation({
    mutationFn: async (orgId: string) => {
      await client.switchOrganization(orgId);
      await queryClient.invalidateQueries({
        queryKey: authKeys.currentUsers(),
      });
    },
    onError: (err) => {
      log.error("Failed to switch organization", err);
    },
  });

  const { orgs, effectiveSelectedOrgId, isLoading, error } = useOrganizations();

  const currentUserOrgId = currentUser?.organization?.id;
  const hasOrgChanged = effectiveSelectedOrgId !== currentUserOrgId;

  const { projects, isLoading: projectsLoading } = useProjects();

  const selectedProjectId = useMemo(() => {
    if (manuallySelectedProjectId !== null) return manuallySelectedProjectId;
    return currentProjectId ?? projects[0]?.id ?? null;
  }, [manuallySelectedProjectId, currentProjectId, projects]);

  const handleContinue = async () => {
    if (!effectiveSelectedOrgId) return;

    if (effectiveSelectedOrgId !== selectedOrgId) {
      selectOrg(effectiveSelectedOrgId);
    }

    if (client && hasOrgChanged) {
      try {
        await switchOrganizationMutation.mutateAsync(effectiveSelectedOrgId);
      } catch {
        // Error handled by onError callback
      }
    }

    if (
      !hasOrgChanged &&
      selectedProjectId &&
      selectedProjectId !== currentProjectId
    ) {
      await trpcClient.auth.selectProject.mutate({
        projectId: selectedProjectId,
      });
    }

    onNext();
  };

  const handleSelectOrg = (orgId: string) => {
    selectOrg(orgId);
    setSelectedProjectId(null);
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
        <Flex direction="column" gap="3" mb="4">
          <img
            src={codeLogo}
            alt="PostHog"
            style={{
              height: "24px",
              objectFit: "contain",
              alignSelf: "flex-start",
            }}
          />
          <Text
            size="6"
            weight="bold"
            style={{
              color: "var(--gray-12)",
              lineHeight: 1.3,
            }}
          >
            Choose your organization
          </Text>
          <Text size="3" style={{ color: "var(--gray-12)", opacity: 0.7 }}>
            Select which PostHog organization and project to use with PostHog
            Code.
          </Text>
        </Flex>

        {error && (
          <Callout.Root color="red" size="1" mb="6">
            <Callout.Text>
              Failed to load organizations. Please try again later.
            </Callout.Text>
          </Callout.Root>
        )}

        <Box
          className="scrollbar-hide"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            marginBottom: "var(--space-6)",
          }}
        >
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium" style={{ color: "var(--gray-12)" }}>
              Organization
            </Text>
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
                        backgroundColor: "var(--color-panel-solid)",
                        border: "2px solid var(--gray-4)",
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
                  <Flex direction="column" gap="2">
                    {orgs.map((org) => (
                      <OrgCard
                        key={org.id}
                        name={org.name}
                        isSelected={effectiveSelectedOrgId === org.id}
                        onSelect={() => handleSelectOrg(org.id)}
                      />
                    ))}
                  </Flex>
                </motion.div>
              )}
            </AnimatePresence>
          </Flex>

          {!isLoading && !hasOrgChanged && projects.length > 0 && (
            <Flex direction="column" gap="2" mt="4">
              <Text
                size="2"
                weight="medium"
                style={{ color: "var(--gray-12)" }}
              >
                Project
              </Text>
              <Select.Root
                value={
                  selectedProjectId !== null
                    ? String(selectedProjectId)
                    : undefined
                }
                onValueChange={(value) => setSelectedProjectId(Number(value))}
                size="2"
                disabled={projectsLoading}
              >
                <Select.Trigger
                  placeholder="Select a project..."
                  color="gray"
                  variant="surface"
                  style={{ width: "100%" }}
                />
                <Select.Content color="gray">
                  {projects.map((project) => (
                    <Select.Item key={project.id} value={String(project.id)}>
                      {project.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            </Flex>
          )}
        </Box>

        <Flex gap="3" align="center" justify="between" flexShrink="0">
          <Button
            size="2"
            variant="ghost"
            onClick={onBack}
            style={{ color: "var(--gray-12)" }}
          >
            <ArrowLeft size={16} />
            Back
          </Button>
          <Button
            size="2"
            onClick={handleContinue}
            disabled={
              !effectiveSelectedOrgId ||
              isLoading ||
              switchOrganizationMutation.isPending
            }
          >
            {switchOrganizationMutation.isPending ? "Switching..." : "Continue"}
            {!switchOrganizationMutation.isPending && <ArrowRight size={16} />}
          </Button>
        </Flex>
      </Flex>
    </Flex>
  );
}

interface OrgCardProps {
  name: string;
  isSelected: boolean;
  onSelect: () => void;
}

function OrgCard({ name, isSelected, onSelect }: OrgCardProps) {
  return (
    <Flex
      align="center"
      justify="between"
      gap="3"
      px="4"
      py="3"
      onClick={onSelect}
      style={{
        backgroundColor: "var(--color-panel-solid)",
        border: isSelected
          ? "2px solid var(--accent-9)"
          : "2px solid var(--gray-4)",
        cursor: "pointer",
        transition: "all 0.2s ease",
      }}
    >
      <Flex align="center" gap="3" style={{ minWidth: 0 }}>
        <Text
          size="3"
          weight="medium"
          style={{ color: "var(--gray-12)" }}
          truncate
        >
          {name}
        </Text>
      </Flex>

      <Box
        width="16px"
        height="16px"
        flexShrink="0"
        style={{
          borderRadius: "50%",
          border: isSelected ? "none" : "2px solid var(--gray-7)",
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
