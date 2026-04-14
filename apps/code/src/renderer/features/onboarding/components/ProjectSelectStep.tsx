import { OAuthControls } from "@features/auth/components/OAuthControls";
import { useOptionalAuthenticatedClient } from "@features/auth/hooks/authClient";
import { useSelectProjectMutation } from "@features/auth/hooks/authMutations";
import {
  authKeys,
  useAuthStateValue,
  useCurrentUser,
} from "@features/auth/hooks/authQueries";
import { Command } from "@features/command/components/Command";
import { useProjects } from "@features/projects/hooks/useProjects";
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  CheckCircle,
} from "@phosphor-icons/react";
import { Box, Button, Flex, Popover, Skeleton, Text } from "@radix-ui/themes";
import explorerHog from "@renderer/assets/images/hedgehogs/explorer-hog.png";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logger } from "@utils/logger";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { OnboardingHogTip } from "./OnboardingHogTip";

import "./ProjectSelect.css";

const log = logger.scope("project-select-step");

interface ProjectSelectStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ProjectSelectStep({ onNext, onBack }: ProjectSelectStepProps) {
  const isAuthenticated =
    useAuthStateValue((state) => state.status) === "authenticated";
  const selectProjectMutation = useSelectProjectMutation();
  const currentProjectId = useAuthStateValue((state) => state.projectId);
  const { projects, currentProject, currentUser, isLoading } = useProjects();
  const [projectOpen, setProjectOpen] = useState(false);
  const [orgOpen, setOrgOpen] = useState(false);

  const client = useOptionalAuthenticatedClient();
  const queryClient = useQueryClient();
  const { data: fullUser } = useCurrentUser({ client });

  const organizations = useMemo(() => {
    if (!fullUser?.organizations) return [];
    return fullUser.organizations as Array<{
      id: string;
      name: string;
      slug: string;
    }>;
  }, [fullUser]);

  const currentOrg = fullUser?.organization as
    | { id: string; name: string }
    | undefined;
  const hasMultipleOrgs = organizations.length > 1;

  const switchOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      if (!client) return;
      await client.switchOrganization(orgId);
      await queryClient.invalidateQueries({
        queryKey: authKeys.currentUsers(),
      });
    },
    onError: (err) => {
      log.error("Failed to switch organization", err);
    },
  });

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
          align="center"
          style={{ flex: 1, minHeight: 0, width: "100%" }}
        >
          <Flex
            direction="column"
            align="start"
            gap="6"
            style={{ width: "100%", maxWidth: 560 }}
          >
            {/* Section 1: Sign in */}
            <Flex direction="column" gap="4" style={{ width: "100%" }}>
              <Text
                size="6"
                weight="bold"
                style={{ color: "var(--gray-12)", lineHeight: 1.3 }}
              >
                Pick your home base
              </Text>

              <AnimatePresence mode="wait">
                {isAuthenticated ? (
                  <motion.div
                    key="signed-in"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Flex
                      align="center"
                      gap="2"
                      style={{
                        padding: "10px 14px",
                        backgroundColor: "var(--green-a2)",
                        border: "1px solid var(--green-a5)",
                        borderRadius: 8,
                      }}
                    >
                      <CheckCircle
                        size={18}
                        weight="fill"
                        style={{ color: "var(--green-9)" }}
                      />
                      <Text
                        size="2"
                        weight="medium"
                        style={{ color: "var(--green-11)" }}
                      >
                        Signed in
                        {currentUser?.email ? ` as ${currentUser.email}` : ""}
                      </Text>
                    </Flex>
                  </motion.div>
                ) : (
                  <motion.div
                    key="oauth"
                    initial={{ opacity: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                  >
                    <OAuthControls />
                  </motion.div>
                )}
              </AnimatePresence>
            </Flex>

            {/* Section 2: Organization selector (only if multiple orgs) */}
            {hasMultipleOrgs && (
              <motion.div
                style={{ width: "100%" }}
                animate={{ opacity: isAuthenticated ? 1 : 0.4 }}
                transition={{ duration: 0.3 }}
              >
                <Flex direction="column" gap="4" style={{ width: "100%" }}>
                  <Text
                    size="4"
                    weight="medium"
                    style={{ color: "var(--gray-12)" }}
                  >
                    Select your organization
                  </Text>

                  <Popover.Root open={orgOpen} onOpenChange={setOrgOpen}>
                    <Popover.Trigger>
                      <button
                        type="button"
                        disabled={switchOrgMutation.isPending}
                        style={{
                          all: "unset",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          width: "100%",
                          boxSizing: "border-box",
                          padding: "10px 14px",
                          backgroundColor: "var(--color-panel-solid)",
                          border: "1px solid var(--gray-a3)",
                          borderRadius: 10,
                          boxShadow:
                            "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                          cursor: switchOrgMutation.isPending
                            ? "wait"
                            : "pointer",
                          fontSize: 14,
                          fontFamily: "inherit",
                        }}
                      >
                        <Text
                          size="2"
                          weight="medium"
                          style={{ color: "var(--gray-12)" }}
                        >
                          {switchOrgMutation.isPending
                            ? "Switching..."
                            : (currentOrg?.name ?? "Select organization...")}
                        </Text>
                        <CaretDown
                          size={14}
                          style={{ color: "var(--gray-9)", flexShrink: 0 }}
                        />
                      </button>
                    </Popover.Trigger>
                    <Popover.Content
                      className="project-select-popover"
                      style={{
                        padding: 0,
                        width: "var(--radix-popover-trigger-width)",
                      }}
                      side="bottom"
                      align="center"
                      sideOffset={4}
                      avoidCollisions={false}
                    >
                      <Command.Root shouldFilter={true} label="Org picker">
                        <Command.Input
                          placeholder="Search organizations..."
                          autoFocus={true}
                        />
                        <Command.List>
                          <Command.Empty>No organizations found.</Command.Empty>
                          {[...organizations]
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((org) => (
                              <Command.Item
                                key={org.id}
                                value={`${org.name} ${org.id}`}
                                onSelect={() => {
                                  if (org.id !== currentOrg?.id) {
                                    switchOrgMutation.mutate(org.id);
                                  }
                                  setOrgOpen(false);
                                }}
                              >
                                <Flex
                                  align="center"
                                  justify="between"
                                  width="100%"
                                >
                                  <Box>
                                    <Text size="2">{org.name}</Text>
                                  </Box>
                                  {org.id === currentOrg?.id && (
                                    <Check
                                      size={14}
                                      style={{ color: "var(--accent-11)" }}
                                    />
                                  )}
                                </Flex>
                              </Command.Item>
                            ))}
                        </Command.List>
                      </Command.Root>
                    </Popover.Content>
                  </Popover.Root>
                </Flex>
              </motion.div>
            )}

            {/* Section 3: Project selector */}
            <motion.div
              style={{ width: "100%" }}
              animate={{ opacity: isAuthenticated ? 1 : 0.4 }}
              transition={{ duration: 0.3 }}
            >
              <Flex direction="column" gap="4" style={{ width: "100%" }}>
                <Text
                  size="4"
                  weight="medium"
                  style={{ color: "var(--gray-12)" }}
                >
                  Select your project
                </Text>

                {!isAuthenticated ? (
                  <button
                    type="button"
                    disabled
                    style={{
                      all: "unset",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "10px 14px",
                      backgroundColor: "var(--gray-3)",
                      border: "1px solid var(--gray-a3)",
                      borderRadius: 10,
                      fontSize: 14,
                      fontFamily: "inherit",
                      cursor: "not-allowed",
                    }}
                  >
                    <Text size="2" style={{ color: "var(--gray-8)" }}>
                      Sign in to see your projects
                    </Text>
                    <CaretDown
                      size={14}
                      style={{ color: "var(--gray-6)", flexShrink: 0 }}
                    />
                  </button>
                ) : isLoading || switchOrgMutation.isPending ? (
                  <Skeleton
                    style={{ height: 40, borderRadius: 8, width: "100%" }}
                  />
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.05 }}
                    style={{ width: "100%" }}
                  >
                    <Popover.Root
                      open={projectOpen}
                      onOpenChange={setProjectOpen}
                    >
                      <Popover.Trigger>
                        <button
                          type="button"
                          style={{
                            all: "unset",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            width: "100%",
                            boxSizing: "border-box",
                            padding: "10px 14px",
                            backgroundColor: "var(--color-panel-solid)",
                            border: "1px solid var(--gray-a3)",
                            borderRadius: 10,
                            boxShadow:
                              "0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)",
                            cursor: "pointer",
                            fontSize: 14,
                            fontFamily: "inherit",
                          }}
                        >
                          <Flex direction="column" gap="1">
                            <Text
                              size="2"
                              weight="medium"
                              style={{ color: "var(--gray-12)" }}
                            >
                              {currentProject?.name ?? "Select a project..."}
                            </Text>
                            {currentProject && !hasMultipleOrgs && (
                              <Text
                                size="1"
                                style={{ color: "var(--gray-11)" }}
                              >
                                {currentProject.organization.name}
                              </Text>
                            )}
                          </Flex>
                          <CaretDown
                            size={14}
                            style={{ color: "var(--gray-9)", flexShrink: 0 }}
                          />
                        </button>
                      </Popover.Trigger>
                      <Popover.Content
                        className="project-select-popover"
                        style={{
                          padding: 0,
                          width: "var(--radix-popover-trigger-width)",
                        }}
                        side="bottom"
                        align="center"
                        sideOffset={4}
                        avoidCollisions={false}
                      >
                        <Command.Root
                          shouldFilter={true}
                          label="Project picker"
                        >
                          <Command.Input
                            placeholder="Search projects..."
                            autoFocus={true}
                          />
                          <Command.List>
                            <Command.Empty>No projects found.</Command.Empty>
                            {[...projects]
                              .sort((a, b) => a.name.localeCompare(b.name))
                              .map((project) => (
                                <Command.Item
                                  key={project.id}
                                  value={`${project.name} ${project.id}`}
                                  onSelect={() => {
                                    selectProjectMutation.mutate(project.id);
                                    setProjectOpen(false);
                                  }}
                                >
                                  <Flex
                                    align="center"
                                    justify="between"
                                    width="100%"
                                  >
                                    <Box>
                                      <Text size="2">{project.name}</Text>
                                    </Box>
                                    {project.id === currentProjectId && (
                                      <Check
                                        size={14}
                                        style={{ color: "var(--accent-11)" }}
                                      />
                                    )}
                                  </Flex>
                                </Command.Item>
                              ))}
                          </Command.List>
                        </Command.Root>
                      </Popover.Content>
                    </Popover.Root>
                  </motion.div>
                )}

                {isAuthenticated &&
                  !isLoading &&
                  !switchOrgMutation.isPending && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.1 }}
                    >
                      <OnboardingHogTip
                        hogSrc={explorerHog}
                        message="I'll use data from this project to help drive product decisions."
                      />
                    </motion.div>
                  )}
              </Flex>
            </motion.div>
          </Flex>
        </Flex>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.15 }}
        >
          <Flex gap="4" align="center" flexShrink="0">
            <Button size="3" variant="outline" color="gray" onClick={onBack}>
              <ArrowLeft size={16} />
              Back
            </Button>
            {isAuthenticated && !isLoading && (
              <Button
                size="3"
                onClick={onNext}
                disabled={currentProjectId == null}
              >
                Continue
                <ArrowRight size={16} />
              </Button>
            )}
          </Flex>
        </motion.div>
      </Flex>
    </Flex>
  );
}
